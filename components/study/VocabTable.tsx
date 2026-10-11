'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { QuizSession } from '@/components/study/QuizSession'
import { BookNotice } from '@/components/study/BookNotice'
import { validateNote, type CardNote, type NoteSense } from '@/lib/study/notes-store'
import { itemFromRecord } from '@/lib/study/quiz'
import { enroll, isInBook, refreshSnapshots, type EnrollInput } from '@/lib/study/srs'
import { useNotes } from '@/lib/study/use-notes'
import { useReviewRecords } from '@/lib/study/use-review'
import { formatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { VocabCard, VocabSet } from '@/types/study'

interface VocabTableProps {
  set: VocabSet
  /** `ted:<slug>` — namespaces card ids so one talk never collides with another. */
  deckId: string
  sourceTitle: string
  /** In-app path back to this page, stored with each card for the review queue. */
  sourcePath: string
}

type Tab = 'words' | 'phrases'

/** Parts of speech offered in the form, stored as the labels the model and dictionary use. */
const WORD_POS = ['noun', 'verb', 'adjective', 'adverb'] as const
const PHRASE_POS = ['phrasal verb', 'thành ngữ', 'collocation', 'cụm từ'] as const

export function reviewCardId(deckId: string, term: string): string {
  return `${deckId}:${term}`
}

function enrollInput(card: VocabCard, deckId: string, sourceTitle: string, sourcePath: string): EnrollInput {
  return {
    id: reviewCardId(deckId, card.term),
    deckId,
    term: card.term,
    snapshot: {
      display: card.display,
      ipa: card.ipa,
      partOfSpeech: card.partOfSpeech,
      meaningVi: card.meaningVi,
      context: card.context,
      contextMatch: card.contextMatch,
      startMs: card.startMs,
      cueIdx: card.cueIdx,
      sourceTitle,
      sourcePath,
      senses: card.senses,
      singleCommonSense: card.singleCommonSense,
    },
  }
}

/** The speaker's line with the word as said in bold — sliced by offset, never rebuilt. */
function SpokenLine({ card }: { card: VocabCard }) {
  const { start, length } = card.contextMatch
  const valid = start >= 0 && length > 0 && start + length <= card.context.length
  if (!valid) return <>“{card.context}”</>
  return (
    <>
      “{card.context.slice(0, start)}
      <strong className="font-semibold text-ink not-italic">{card.context.slice(start, start + length)}</strong>
      {card.context.slice(start + length)}”
    </>
  )
}

/**
 * The talk's words as a table. Only words not yet saved are listed: once a
 * word is in the word book it has been learnt from this talk and drops out.
 * Tapping a row opens a form; a word is saved only with the learner's own
 * meaning and example, so nothing half-learnt lands in the book.
 */
export function VocabTable({ set, deckId, sourceTitle, sourcePath }: VocabTableProps) {
  const t = useTranslations('vocab')
  const { records, save } = useReviewRecords()
  const { notes, save: saveNote } = useNotes()

  const words = useMemo(
    () => set.groups.filter((group) => group.key !== 'phrases').flatMap((group) => group.items),
    [set.groups],
  )
  const phrases = useMemo(() => set.groups.find((group) => group.key === 'phrases')?.items ?? [], [set.groups])
  const [tab, setTab] = useState<Tab>(words.length > 0 ? 'words' : 'phrases')
  const [open, setOpen] = useState<VocabCard | null>(null)
  const [quizOpen, setQuizOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const deckRecords = useMemo(
    () => (records ?? []).filter((record) => record.deckId === deckId && isInBook(record)),
    [deckId, records],
  )
  const savedIds = useMemo(() => new Set(deckRecords.map((record) => record.id)), [deckRecords])

  // Saved cards keep their snapshot in step with the page; nothing new is enrolled here.
  useEffect(() => {
    if (records === null) return
    const inputs = set.groups.flatMap((group) =>
      group.items.map((card) => enrollInput(card, deckId, sourceTitle, sourcePath)),
    )
    const changed = refreshSnapshots(records, inputs)
    if (changed.length > 0) void save(changed)
  }, [deckId, records, save, set.groups, sourcePath, sourceTitle])

  const list = (tab === 'words' ? words : phrases).filter((card) => !savedIds.has(reviewCardId(deckId, card.term)))

  const quizItems = useMemo(
    () => deckRecords.map((record) => itemFromRecord(record, notes?.get(record.id))),
    [deckRecords, notes],
  )

  const saveCard = useCallback(
    async (card: VocabCard, sense: NoteSense) => {
      if (records === null) return
      const id = reviewCardId(deckId, card.term)
      const previous: CardNote | undefined = notes?.get(id)
      // The meaning written here is the one in the talk; older meanings stay, unmarked.
      const others = (previous?.senses ?? []).slice(1).map((other) => ({ ...other, inTranscript: false }))
      await saveNote({ id, senses: [sense, ...others], updatedAt: new Date().toISOString() })
      const changed = enroll(records, [enrollInput(card, deckId, sourceTitle, sourcePath)], new Date())
      if (changed.length > 0) await save(changed)
      setOpen(null)
      setToast(t('savedToast', { word: card.display }))
    },
    [deckId, notes, records, save, saveNote, sourcePath, sourceTitle, t],
  )

  if (quizOpen) {
    return <QuizSession items={quizItems} scope={deckId} onClose={() => setQuizOpen(false)} />
  }

  if (words.length === 0 && phrases.length === 0) {
    return <p className="text-muted">{t('empty')}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <BookNotice records={records} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {words.length > 0 && phrases.length > 0 ? (
          <div className="flex gap-2" role="tablist">
            {(['words', 'phrases'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'min-h-11 rounded-xl border px-3 text-sm font-medium',
                  tab === key
                    ? 'border-accent-line bg-accent-soft text-accent-ink'
                    : 'border-line text-muted hover:border-accent-line hover:text-ink',
                )}
              >
                {key === 'words' ? t('tabWords') : t('tabPhrases')}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        {deckRecords.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuizOpen(true)}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
          >
            {t('quizSaved')}
          </button>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted">
        {toast ? <span className="font-medium text-accent-ink">{toast} </span> : null}
        {deckRecords.length > 0 ? (
          <>
            {t('savedSummary', { count: deckRecords.length })} ·{' '}
            <Link
              href={`/words?from=${encodeURIComponent(sourcePath)}`}
              className="inline-flex min-h-11 items-center font-medium underline decoration-line underline-offset-4 hover:text-ink"
            >
              {t('openBook')}
            </Link>
          </>
        ) : (
          t('tapHint')
        )}
      </p>

      {list.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-4 text-muted">{t('allSaved')}</p>
      ) : (
        <div className="overflow-hidden rounded-card border border-line">
          <div
            aria-hidden
            className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_4rem] gap-2 border-b border-line bg-raised px-3 py-2 text-xs font-medium text-muted sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem] sm:gap-3 sm:px-4"
          >
            <span>{t('colWord')}</span>
            <span>{t('colIpa')}</span>
            <span>{t('colPos')}</span>
          </div>
          <ul className="divide-y divide-line bg-surface">
            {list.map((card) => (
              <li key={card.term}>
                <button
                  type="button"
                  onClick={() => setOpen(card)}
                  className="grid min-h-12 w-full grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_4rem] items-center gap-2 px-3 py-2 text-left hover:bg-raised focus-visible:bg-raised sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem] sm:gap-3 sm:px-4"
                >
                  <span className="font-medium break-words">{card.display}</span>
                  <span className="font-mono text-xs break-words text-muted sm:text-sm">{card.ipa || '—'}</span>
                  <span className="text-sm text-muted">
                    {card.partOfSpeech ? (t.has(`pos.${card.partOfSpeech}`) ? t(`pos.${card.partOfSpeech}`) : card.partOfSpeech) : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open ? (
        <WordSheet
          card={open}
          note={notes?.get(reviewCardId(deckId, open.term)) ?? null}
          disabled={records === null || notes === null}
          onClose={() => setOpen(null)}
          onSave={(sense) => saveCard(open, sense)}
        />
      ) : null}
    </div>
  )
}

interface WordSheetProps {
  card: VocabCard
  /** Left from an earlier save, when the word was taken out of the book since. */
  note: CardNote | null
  disabled: boolean
  onClose: () => void
  onSave: (sense: NoteSense) => Promise<void>
}

/**
 * The form for one word, in a modal `<dialog>`: the browser handles focus,
 * Escape and the backdrop. A sheet from the bottom on phones, a centred box on
 * wider screens.
 */
function WordSheet({ card, note, disabled, onClose, onSave }: WordSheetProps) {
  const t = useTranslations('vocab')
  const td = useTranslations('vocab.detail')
  const tn = useTranslations('vocab.note')
  const baseId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const previous = note?.senses[0]
  const isPhrase = card.term.includes(' ')

  const [partOfSpeech, setPartOfSpeech] = useState(previous?.partOfSpeech || card.partOfSpeech)
  const [meaning, setMeaning] = useState(previous?.meaningVi ?? '')
  const [example, setExample] = useState(previous?.example.en ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const options: readonly string[] = isPhrase ? PHRASE_POS : WORD_POS
  const posOptions = partOfSpeech && !options.includes(partOfSpeech) ? [partOfSpeech, ...options] : options
  const posLabel = (value: string) => (t.has(`pos.${value}`) ? t(`pos.${value}`) : value)

  const sense: NoteSense = {
    meaningVi: meaning,
    partOfSpeech,
    inTranscript: true,
    // The example's translation is no longer asked for; an older one is kept.
    example: { en: example, vi: previous?.example.vi ?? '' },
  }
  const validation = validateNote([sense])
  const missingMeaning = !meaning.trim()
  const missingExample = !example.trim()
  /** The limit a field broke, if any — empty fields are handled by the disabled button. */
  const tooLong = validation.ok
    ? null
    : (validation.issues.find((issue) => issue.scope === 'sense' && issue.code === 'too-long') as
        | { max?: number }
        | undefined)?.max ?? null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (!validation.ok || disabled) return
    setStatus('saving')
    try {
      await onSave(validation.senses[0]!)
    } catch {
      setStatus('failed')
    }
  }

  const fieldClass = (invalid: boolean) =>
    cn(
      'w-full rounded-xl border bg-canvas px-3 py-2.5 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:border-accent-line',
      invalid ? 'border-wrong-line' : 'border-line',
    )

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        // A tap on the backdrop (the dialog element itself, outside the panel) closes it.
        if (event.target === event.currentTarget) dialog.current?.close()
      }}
      aria-labelledby={`${baseId}-title`}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${baseId}-title`} className="text-2xl font-semibold tracking-tight break-words">
              {card.display}
            </h2>
            {card.ipa ? <p className="mt-0.5 font-mono text-muted">{card.ipa}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={td('close')}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-raised hover:text-ink"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
              <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" />
            </svg>
          </button>
        </div>

        <figure className="rounded-xl bg-raised p-3">
          <figcaption className="text-xs text-faint">
            {td('inTalk')} · <span className="font-mono">{formatTimestamp(card.startMs)}</span>
          </figcaption>
          <blockquote lang="en" className="mt-1 text-sm leading-relaxed text-muted italic">
            <SpokenLine card={card} />
          </blockquote>
        </figure>

        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${baseId}-pos`}>
          {td('pos')}
          <select
            id={`${baseId}-pos`}
            value={partOfSpeech}
            onChange={(event) => setPartOfSpeech(event.target.value)}
            className={cn(fieldClass(false), 'min-h-11 font-normal')}
          >
            <option value="">{td('posUnknown')}</option>
            {posOptions.map((value) => (
              <option key={value} value={value}>
                {posLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${baseId}-meaning`}>
          {td('meaning')}
          <input
            id={`${baseId}-meaning`}
            value={meaning}
            onChange={(event) => setMeaning(event.target.value)}
            placeholder={td('meaningPlaceholder')}
            autoComplete="off"
            aria-invalid={tried && missingMeaning}
            className={cn(fieldClass(tried && missingMeaning), 'min-h-11 font-normal')}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${baseId}-example`}>
          {td('example')}
          <textarea
            id={`${baseId}-example`}
            value={example}
            onChange={(event) => setExample(event.target.value)}
            placeholder={td('examplePlaceholder')}
            lang="en"
            rows={2}
            aria-invalid={tried && missingExample}
            className={cn(fieldClass(tried && missingExample), 'font-normal')}
          />
        </label>

        {tried && !validation.ok && tooLong ? (
          <p role="alert" className="text-sm text-wrong">
            {tn('errors.tooLong', { max: tooLong })}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className="text-sm text-wrong">
            {td('failed')}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={disabled || status === 'saving' || missingMeaning || missingExample}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-ink px-4 font-medium text-canvas hover:opacity-90 disabled:opacity-40"
        >
          {status === 'saving' ? td('saving') : td('save')}
        </button>
        {missingMeaning || missingExample ? (
          <p className="-mt-2 text-center text-xs text-faint">{td('needBoth')}</p>
        ) : null}
      </form>
    </dialog>
  )
}
