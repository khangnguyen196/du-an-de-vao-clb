'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { State } from 'ts-fsrs'
import { BookNotice } from '@/components/study/BookNotice'
import { NoteEditor } from '@/components/study/NoteEditor'
import { QuizSession } from '@/components/study/QuizSession'
import { adoptAsInTranscript, mergeCardContent } from '@/lib/study/card-content'
import { itemFromRecord } from '@/lib/study/quiz'
import { bookRecords, buildQueue, intervalParts, removeFromBook } from '@/lib/study/srs'
import type { ReviewRecord } from '@/lib/study/srs-store'
import { useNotes } from '@/lib/study/use-notes'
import { useNow, useReviewRecords } from '@/lib/study/use-review'
import { formatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'due' | 'new' | 'noMeaning'

const FILTERS: readonly Filter[] = ['all', 'due', 'new', 'noMeaning']

const STATE_KEY: Record<number, 'new' | 'learning' | 'review' | 'relearning'> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
}

/** Case- and diacritic-insensitive, so "kha nang" finds "khả năng". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

function isDue(record: ReviewRecord, nowMs: number): boolean {
  return record.scheduling.state !== State.New && Date.parse(record.scheduling.due) <= nowMs
}

/**
 * Every word the learner saved, across talks: find one, fill in its meaning,
 * take it out. Reviewing itself happens on /review — this page is the shelf,
 * not the drill.
 */
export function WordBook() {
  const t = useTranslations('wordBook')
  const tv = useTranslations('vocab')
  const { records, save } = useReviewRecords()
  const { notes, save: saveNote, remove: removeNote } = useNotes()
  const now = useNow(60_000)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [deckId, setDeckId] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  /** The record as it was before removal, so undo restores it exactly. */
  const [removed, setRemoved] = useState<ReviewRecord | null>(null)
  const [quizOpen, setQuizOpen] = useState(false)

  const book = useMemo(() => (records ? bookRecords(records) : null), [records])

  const queue = useMemo(() => (book ? buildQueue(book, now) : null), [book, now])
  const toReview = queue ? queue.due.length + queue.fresh.length : 0

  const talks = useMemo(() => {
    const byDeck = new Map<string, string>()
    for (const record of book ?? []) byDeck.set(record.deckId, record.snapshot.sourceTitle)
    return [...byDeck].sort((a, b) => a[1].localeCompare(b[1]))
  }, [book])

  /** The quiz follows the talk filter, so "quiz me on this talk's saved words" is one tap. */
  const quizItems = useMemo(
    () =>
      (book ?? [])
        .filter((record) => !deckId || record.deckId === deckId)
        .map((record) => itemFromRecord(record, notes?.get(record.id))),
    [book, deckId, notes],
  )

  const rows = useMemo(() => {
    if (!book) return []
    const nowMs = now.getTime()
    const needle = fold(query.trim())

    return book
      .map((record) => {
        const merged = mergeCardContent(record.snapshot, notes?.get(record.id))
        const meaning = merged.senses[0]?.meaningVi || record.snapshot.meaningVi
        return { record, merged, meaning }
      })
      .filter(({ record, merged, meaning }) => {
        if (deckId && record.deckId !== deckId) return false
        if (filter === 'due' && !isDue(record, nowMs)) return false
        if (filter === 'new' && record.scheduling.state !== State.New) return false
        if (filter === 'noMeaning' && meaning) return false
        if (!needle) return true
        const haystack = [record.snapshot.display, meaning, ...merged.senses.map((sense) => sense.meaningVi)]
        return haystack.some((text) => fold(text).includes(needle))
      })
      .sort((a, b) => a.record.snapshot.display.localeCompare(b.record.snapshot.display))
  }, [book, deckId, filter, notes, now, query])

  const dueLabel = (record: ReviewRecord): string => {
    const state = tv(`state.${STATE_KEY[record.scheduling.state] ?? 'new'}`)
    if (record.scheduling.state === State.New) return state
    const dueMs = Date.parse(record.scheduling.due) - now.getTime()
    if (dueMs <= 0) return `${state} · ${tv('dueNow')}`
    const { value, unit } = intervalParts(dueMs)
    return `${state} · ${tv('dueIn', { interval: tv(`interval.${unit}`, { value }) })}`
  }

  const remove = async (record: ReviewRecord) => {
    setRemoved(record)
    setOpenId(null)
    await save([removeFromBook(record)])
  }

  const undo = async () => {
    if (!removed) return
    const record = removed
    setRemoved(null)
    await save([record])
  }

  if (!records || !book || !queue) {
    return <p className="text-muted">{t('loading')}</p>
  }

  const undoBar = removed ? (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-4 py-2 text-sm"
    >
      <span className="min-w-0 flex-1 basis-48 text-muted text-pretty">
        {t('removed', { word: removed.snapshot.display })}
      </span>
      <button
        type="button"
        onClick={() => void undo()}
        className="inline-flex min-h-11 items-center rounded-xl px-3 font-medium text-accent-ink underline decoration-accent-line underline-offset-4"
      >
        {t('undo')}
      </button>
    </div>
  ) : null

  if (quizOpen && book.length > 0) {
    return (
      <QuizSession
        items={quizItems}
        scope={deckId ? `book:${deckId}` : 'book'}
        onClose={() => setQuizOpen(false)}
        showSource={!deckId}
      />
    )
  }

  if (book.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <BookNotice records={records} />
        {undoBar}
        <div className="rounded-card border border-line bg-surface p-6">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted text-pretty">{t('emptyBody')}</p>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line"
          >
            {t('backHome')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <BookNotice records={records} />

      {/* Summary + review ------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
        <p className="min-w-0 flex-1 basis-48 text-sm text-muted">
          {t('stats', { count: book.length, due: toReview })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {toReview > 0 ? (
            <Link
              href="/review"
              className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-medium text-canvas hover:opacity-90"
            >
              {t('reviewNow')}
            </Link>
          ) : (
            <span className="text-sm text-faint">{t('nothingToReview')}</span>
          )}
          <button
            type="button"
            onClick={() => setQuizOpen(true)}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
          >
            {t('quiz')}
          </button>
        </div>
      </div>

      {undoBar}

      {/* Search + filters -------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search')}
          aria-label={t('searchLabel')}
          className="min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:border-accent-line"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
            {FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  'min-h-11 shrink-0 rounded-xl border px-3 text-sm font-medium whitespace-nowrap',
                  filter === key
                    ? 'border-accent-line bg-accent-soft text-accent-ink'
                    : 'border-line text-muted hover:border-accent-line hover:text-ink',
                )}
              >
                {t(`filter.${key}`)}
              </button>
            ))}
          </div>

          {talks.length > 1 ? (
            <select
              value={deckId}
              onChange={(event) => setDeckId(event.target.value)}
              aria-label={t('talkFilter')}
              className="min-h-11 w-full max-w-full rounded-xl border border-line bg-canvas px-3 text-base text-ink sm:w-64"
            >
              <option value="">{t('allTalks')}</option>
              {talks.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* Words ------------------------------------------------------------- */}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('noMatch')}</p>
      ) : (
        <ul className="flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line">
          {rows.map(({ record, merged, meaning }) => {
            const open = openId === record.id
            const note = notes?.get(record.id) ?? null
            const { snapshot } = record

            return (
              <li key={record.id} className="bg-surface">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : record.id)}
                  aria-expanded={open}
                  aria-label={t('details', { word: snapshot.display })}
                  className="flex min-h-11 w-full flex-col gap-1 px-4 py-3 text-left hover:bg-raised sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="flex min-w-0 items-baseline gap-2 sm:w-48 sm:shrink-0">
                    <span className="font-medium break-words">{snapshot.display}</span>
                    {snapshot.ipa ? <span className="font-mono text-xs text-faint">{snapshot.ipa}</span> : null}
                  </span>
                  <span className="min-w-0 flex-1 text-pretty">
                    {meaning || <span className="text-faint">{tv('noMeaning')}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted sm:text-right">{dueLabel(record)}</span>
                </button>

                {open ? (
                  <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
                    {merged.senses.length > 0 ? (
                      <ol className="flex flex-col gap-3">
                        {merged.senses.map((sense, index) => (
                          <li key={`${sense.origin}-${String(index)}`} className="text-sm">
                            <p>
                              <span className="font-medium">{sense.meaningVi}</span>
                              {sense.partOfSpeech ? (
                                <span className="ml-2 text-xs text-faint">{sense.partOfSpeech}</span>
                              ) : null}
                              {sense.inTranscript ? (
                                <span className="ml-2 text-xs text-accent-ink">{tv('inTranscript')}</span>
                              ) : null}
                              <span className="ml-2 text-xs text-faint">
                                {sense.origin === 'note' ? tv('note.originNote') : tv('note.originModel')}
                              </span>
                            </p>
                            {sense.example.en ? (
                              <p className="mt-1 text-muted">
                                <span className="text-xs text-faint">{tv('example')}: </span>
                                {sense.example.en}
                                {sense.example.vi ? <span className="block">{sense.example.vi}</span> : null}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : null}

                    <figure className="border-l-2 border-line pl-3 text-sm">
                      <figcaption className="text-xs text-faint">
                        {t('sourceQuote')} · {formatTimestamp(snapshot.startMs)}
                      </figcaption>
                      <blockquote className="mt-1 text-muted italic">“{snapshot.context}”</blockquote>
                    </figure>

                    {notes !== null ? (
                      <NoteEditor
                        cardId={record.id}
                        note={note}
                        modelSenses={snapshot.senses ?? []}
                        onSave={(senses) => saveNote({ id: record.id, senses, updatedAt: new Date().toISOString() })}
                        onRemove={() => removeNote(record.id)}
                        onAdopt={async (sense) => {
                          const next = adoptAsInTranscript(note, record.id, sense, new Date())
                          if (!next) return 'full'
                          await saveNote(next)
                          return 'ok'
                        }}
                      />
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={snapshot.sourcePath}
                        className="inline-flex min-h-11 min-w-0 items-center text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
                      >
                        <span className="truncate">{t('openTalk', { title: snapshot.sourceTitle })}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => void remove(record)}
                        className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium text-muted hover:border-accent-line hover:text-ink"
                      >
                        {t('remove')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
