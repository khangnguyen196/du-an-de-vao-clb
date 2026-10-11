'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'
import {
  NOTE_LIMITS,
  validateNote,
  type CardNote,
  type NoteIssue,
  type NoteSense,
  type NoteSenseField,
} from '@/lib/study/notes-store'
import { cn } from '@/lib/utils'
import type { VocabSense } from '@/types/study'

interface NoteEditorProps {
  /** Resets the editor when the card changes. */
  cardId: string
  note: CardNote | null
  /** Model meanings the learner can adopt as the one used in the talk. */
  modelSenses: readonly VocabSense[]
  onSave: (senses: NoteSense[]) => Promise<void>
  onRemove: () => Promise<void>
  onAdopt: (sense: VocabSense) => Promise<'ok' | 'full'>
}

const emptySense = (): NoteSense => ({
  meaningVi: '',
  partOfSpeech: '',
  inTranscript: false,
  example: { en: '', vi: '' },
})

const controlClass =
  'w-full rounded-xl border bg-canvas px-3 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:border-accent-line'

/**
 * Where the learner writes their own meanings. Sits below the card, never
 * inside it: the card is a button, and form controls nested in a button are
 * invalid HTML that screen readers and browsers handle badly.
 */
export function NoteEditor({ cardId, note, modelSenses, onSave, onRemove, onAdopt }: NoteEditorProps) {
  const t = useTranslations('vocab.note')
  const baseId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<NoteSense[]>([])
  const [issues, setIssues] = useState<NoteIssue[]>([])
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'full'>('idle')

  // A new card must never inherit an open draft from the previous one.
  useEffect(() => {
    setEditing(false)
    setIssues([])
    setStatus('idle')
  }, [cardId])

  const open = () => {
    setDraft(
      note && note.senses.length > 0
        ? note.senses.map((sense) => ({ ...sense, example: { ...sense.example } }))
        : [emptySense()],
    )
    setIssues([])
    setStatus('idle')
    setEditing(true)
  }

  const setField = (index: number, field: NoteSenseField, value: string) => {
    setDraft((current) =>
      current.map((sense, i) => {
        if (i !== index) return sense
        if (field === 'exampleEn') return { ...sense, example: { ...sense.example, en: value } }
        if (field === 'exampleVi') return { ...sense, example: { ...sense.example, vi: value } }
        return { ...sense, [field]: value }
      }),
    )
  }

  // Only one meaning can be the one in the talk, so ticking one clears the rest.
  const setInTranscript = (index: number, checked: boolean) => {
    setDraft((current) =>
      current.map((sense, i) => ({ ...sense, inTranscript: i === index ? checked : checked ? false : sense.inTranscript })),
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const result = validateNote(draft)
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    setStatus('saving')
    try {
      await onSave(result.senses)
    } catch {
      // Did not reach the account (a notice says so). Keep the draft open, not lost.
      setStatus('idle')
      return
    }
    setEditing(false)
    setIssues([])
    setStatus('saved')
  }

  const fieldError = (index: number, field: NoteSenseField): string | null => {
    const issue = issues.find(
      (candidate) => candidate.scope === 'sense' && candidate.senseIndex === index && candidate.field === field,
    )
    if (!issue || issue.scope !== 'sense') return null
    return issue.code === 'required' ? t('errors.required') : t('errors.tooLong', { max: issue.max ?? 0 })
  }

  const noteErrors = issues
    .filter((issue): issue is Extract<NoteIssue, { scope: 'note' }> => issue.scope === 'note')
    .map((issue) =>
      issue.code === 'empty'
        ? t('errors.empty')
        : issue.code === 'too-many'
          ? t('errors.tooMany', { max: NOTE_LIMITS.senses })
          : t('errors.multipleInTranscript'),
    )

  const renderField = (index: number, field: NoteSenseField, label: string, value: string, multiline: boolean) => {
    const id = `${baseId}-${index}-${field}`
    const error = fieldError(index, field)
    const shared = {
      id,
      value,
      'aria-invalid': error !== null,
      'aria-describedby': error ? `${id}-error` : undefined,
      className: cn(controlClass, error ? 'border-accent' : 'border-line'),
    }
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm text-muted">
          {label}
        </label>
        {multiline ? (
          <textarea {...shared} rows={2} className={cn(shared.className, 'min-h-11 py-2')} onChange={(e) => setField(index, field, e.target.value)} />
        ) : (
          <input {...shared} type="text" className={cn(shared.className, 'min-h-11')} onChange={(e) => setField(index, field, e.target.value)} />
        )}
        {error ? (
          <p id={`${id}-error`} className="text-xs text-accent-ink">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <section aria-label={t('title')} className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {note ? t('summary', { count: note.senses.length }) : t('empty')}
        </p>
        {!editing ? (
          <button
            type="button"
            onClick={open}
            className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line"
          >
            {note ? t('edit') : t('write')}
          </button>
        ) : null}
      </div>

      {!editing && modelSenses.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-faint">{t('adoptHint')}</p>
          {modelSenses.map((sense, index) => (
            <button
              key={`${index}-${sense.meaningVi}`}
              type="button"
              onClick={async () => setStatus((await onAdopt(sense)) === 'full' ? 'full' : 'saved')}
              className="min-h-11 rounded-xl border border-line px-3 text-left text-sm hover:border-accent-line"
            >
              {t('adopt', { meaning: sense.meaningVi })}
            </button>
          ))}
        </div>
      ) : null}

      {status === 'saved' ? (
        <p role="status" className="mt-2 text-xs text-accent-ink">
          {t('saved')}
        </p>
      ) : null}
      {status === 'full' ? (
        <p role="alert" className="mt-2 text-xs text-accent-ink">
          {t('errors.adoptFull', { max: NOTE_LIMITS.senses })}
        </p>
      ) : null}

      {editing ? (
        <form noValidate onSubmit={submit} className="mt-4 flex flex-col gap-4">
          {noteErrors.length > 0 ? (
            <div role="alert" className="rounded-xl bg-accent-soft p-3 text-sm text-accent-ink">
              {noteErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          ) : null}

          {draft.map((sense, index) => (
            <fieldset key={index} className="flex flex-col gap-3 rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-medium">{t('senseN', { n: index + 1 })}</legend>
              {renderField(index, 'meaningVi', t('meaning'), sense.meaningVi, false)}
              {renderField(index, 'partOfSpeech', t('partOfSpeech'), sense.partOfSpeech, false)}
              {renderField(index, 'exampleEn', t('exampleEn'), sense.example.en, true)}
              {renderField(index, 'exampleVi', t('exampleVi'), sense.example.vi, true)}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={sense.inTranscript}
                  onChange={(e) => setInTranscript(index, e.target.checked)}
                  className="size-5"
                />
                {t('inTranscript')}
              </label>
              {draft.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}
                  className="min-h-11 self-start rounded-xl px-3 text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
                >
                  {t('removeSense')}
                </button>
              ) : null}
            </fieldset>
          ))}

          {draft.length === 1 ? <p className="text-xs text-faint">{t('hintMore')}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={status === 'saving'}
              className="min-h-11 rounded-xl bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-60"
            >
              {t('save')}
            </button>
            <button
              type="button"
              disabled={draft.length >= NOTE_LIMITS.senses}
              onClick={() => setDraft((current) => [...current, emptySense()])}
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line disabled:opacity-50"
            >
              {t('addSense')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setIssues([])
              }}
              className="min-h-11 rounded-xl px-3 text-sm text-muted hover:text-ink"
            >
              {t('cancel')}
            </button>
            {note ? (
              <button
                type="button"
                onClick={async () => {
                  await onRemove()
                  setEditing(false)
                  setIssues([])
                  setStatus('idle')
                }}
                className="min-h-11 rounded-xl px-3 text-sm text-accent-ink hover:underline"
              >
                {t('deleteNote')}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  )
}
