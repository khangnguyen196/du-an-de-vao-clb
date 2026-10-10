'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rating, State } from 'ts-fsrs'
import { FlipCard } from '@/components/study/FlipCard'
import { BookNotice } from '@/components/study/BookNotice'
import { NoteEditor } from '@/components/study/NoteEditor'
import { QuizSession } from '@/components/study/QuizSession'
import { RatingBar } from '@/components/study/RatingBar'
import { adoptAsInTranscript, mergeCardContent } from '@/lib/study/card-content'
import { shouldIgnoreShortcut } from '@/lib/study/keyboard'
import { itemFromCard } from '@/lib/study/quiz'
import {
  enroll,
  grade,
  intervalParts,
  isInBook,
  refreshSnapshots,
  removeFromBook,
  type EnrollInput,
  type SrsGrade,
} from '@/lib/study/srs'
import type { ReviewRecord } from '@/lib/study/srs-store'
import { useNotes } from '@/lib/study/use-notes'
import { useNow, useReviewRecords } from '@/lib/study/use-review'
import { formatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { VocabCard, VocabGroupKey, VocabSet } from '@/types/study'

interface FlashcardDeckProps {
  set: VocabSet
  /** `ted:<slug>` — namespaces card ids so one talk never collides with another. */
  deckId: string
  sourceTitle: string
  /** In-app path back to this deck, stored with each card for the review queue. */
  sourcePath: string
}

const STATE_KEY: Record<number, 'new' | 'learning' | 'review' | 'relearning'> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
}

const KEY_TO_GRADE: Record<string, SrsGrade> = {
  '1': Rating.Again,
  '2': Rating.Hard,
  '3': Rating.Good,
  '4': Rating.Easy,
}

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

export function SaveIcon({ saved }: { saved: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', saved ? 'fill-current' : 'fill-none stroke-current')}>
      <path
        strokeWidth="1.8"
        strokeLinejoin="round"
        d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
      />
    </svg>
  )
}

export function FlashcardDeck({ set, deckId, sourceTitle, sourcePath }: FlashcardDeckProps) {
  const t = useTranslations('vocab')
  const { records, scheduler, save } = useReviewRecords()
  const { notes, save: saveNote, remove: removeNote } = useNotes()
  const now = useNow()
  const rating = useRef(false)

  const groups = useMemo(() => set.groups.filter((group) => group.items.length > 0), [set.groups])
  const firstGroup = groups[0]?.key ?? 'common'

  const [groupKey, setGroupKey] = useState<VocabGroupKey>(firstGroup)
  const [order, setOrder] = useState<number[]>([])
  const [position, setPosition] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [listView, setListView] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  /**
   * The review time for the card on screen, captured when it is flipped. The
   * rating buttons preview intervals with it and grading uses it too: FSRS fuzz
   * is seeded by the review time, so two different clocks would let a button
   * promise "9 days" and then store 10.
   */
  const [reviewAt, setReviewAt] = useState(() => new Date())

  const activeGroup = useMemo(
    () => groups.find((group) => group.key === groupKey) ?? groups[0],
    [groups, groupKey],
  )
  const items = useMemo(() => activeGroup?.items ?? [], [activeGroup])

  const recordById = useMemo(() => new Map((records ?? []).map((record) => [record.id, record])), [records])
  const recordFor = useCallback(
    (card: VocabCard): ReviewRecord | undefined => recordById.get(reviewCardId(deckId, card.term)),
    [deckId, recordById],
  )

  /*
   * Only words the learner saves join the review schedule. Opening the page
   * just refreshes the content of cards that already have a record, so
   * reopening it writes nothing unless something changed.
   */
  useEffect(() => {
    if (records === null) return

    const inputs = groups.flatMap((group) =>
      group.items.map((card) => enrollInput(card, deckId, sourceTitle, sourcePath)),
    )
    const changed = refreshSnapshots(records, inputs)
    if (changed.length > 0) void save(changed)
  }, [deckId, groups, records, save, sourcePath, sourceTitle])

  const isSaved = useCallback(
    (card: VocabCard) => {
      const record = recordFor(card)
      return record !== undefined && isInBook(record)
    },
    [recordFor],
  )

  const saveCards = useCallback(
    (cards: readonly VocabCard[]) => {
      if (records === null || cards.length === 0) return
      const inputs = cards.map((card) => enrollInput(card, deckId, sourceTitle, sourcePath))
      const changed = enroll(records, inputs, new Date())
      if (changed.length > 0) void save(changed)
    },
    [deckId, records, save, sourcePath, sourceTitle],
  )

  /** Removing keeps the card's progress, so saving it again resumes rather than restarts. */
  const toggleSaved = useCallback(
    (card: VocabCard) => {
      const record = recordFor(card)
      if (record && isInBook(record)) void save([removeFromBook(record)])
      else saveCards([card])
    },
    [recordFor, save, saveCards],
  )

  // A group change resets the walk order back to transcript order.
  useEffect(() => {
    setOrder(items.map((_, index) => index))
    setPosition(0)
    setFlipped(false)
  }, [items])

  const currentIndex = order[position] ?? 0
  const card = items[currentIndex]
  const currentRecord = card ? recordFor(card) : undefined
  const currentSaved = currentRecord !== undefined && isInBook(currentRecord)
  const currentId = card ? reviewCardId(deckId, card.term) : null
  const currentNote = currentId ? (notes?.get(currentId) ?? null) : null
  const currentContent = card ? mergeCardContent(card, currentNote) : null

  useEffect(() => {
    if (flipped) setReviewAt(new Date())
  }, [flipped, card?.term])

  const deckRecords = useMemo(
    () => (records ?? []).filter((record) => record.deckId === deckId && isInBook(record)),
    [deckId, records],
  )
  const totalCards = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups])
  const savedCount = deckRecords.length
  const unsavedInGroup = items.filter((item) => !isSaved(item))
  const dueCount = deckRecords.filter(
    (record) => record.scheduling.state !== State.New && Date.parse(record.scheduling.due) <= now.getTime(),
  ).length

  const step = useCallback(
    (direction: 1 | -1) => {
      if (order.length === 0) return
      setFlipped(false)
      setPosition((current) => (current + direction + order.length) % order.length)
    },
    [order.length],
  )

  const rate = useCallback(
    async (value: SrsGrade) => {
      // A double tap must not grade the same card twice. Unsaved words are not graded.
      if (!currentRecord || !currentSaved || rating.current) return
      rating.current = true
      try {
        await save([grade(currentRecord, value, reviewAt, scheduler)])
        step(1)
      } finally {
        rating.current = false
      }
    },
    [currentRecord, currentSaved, reviewAt, save, scheduler, step],
  )

  const shuffle = useCallback(() => {
    setOrder((current) => {
      const next = [...current]
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        const a = next[i]
        const b = next[j]
        if (a !== undefined && b !== undefined) {
          next[i] = b
          next[j] = a
        }
      }
      return next
    })
    setPosition(0)
    setFlipped(false)
  }, [])

  useEffect(() => {
    if (listView || quizOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event)) return

      if (event.code === 'Space') {
        event.preventDefault()
        setFlipped((value) => !value)
      } else if (event.key === 'ArrowRight') {
        step(1)
      } else if (event.key === 'ArrowLeft') {
        step(-1)
      } else if (flipped && KEY_TO_GRADE[event.key] !== undefined) {
        // Grading only counts once the answer has been seen.
        void rate(KEY_TO_GRADE[event.key]!)
      } else if (event.key === 's' && !event.ctrlKey && !event.metaKey && !event.altKey && card) {
        toggleSaved(card)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [card, flipped, listView, quizOpen, rate, step, toggleSaved])

  /*
   * Every word of the talk, saved or not: the quiz is a way to find out which
   * ones are worth saving. Built from the cards already on the page, so it
   * costs no second model call.
   */
  const allCards = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const quizItems = useMemo(
    () =>
      allCards.map((item) => {
        const id = reviewCardId(deckId, item.term)
        return itemFromCard(item, { id, sourceTitle, sourcePath }, notes?.get(id))
      }),
    [allCards, deckId, notes, sourcePath, sourceTitle],
  )
  const isSavedId = useCallback(
    (id: string) => {
      const record = recordById.get(id)
      return record !== undefined && isInBook(record)
    },
    [recordById],
  )
  const saveIds = useCallback(
    (ids: readonly string[]) => {
      const wanted = new Set(ids)
      saveCards(allCards.filter((item) => wanted.has(reviewCardId(deckId, item.term))))
    },
    [allCards, deckId, saveCards],
  )

  const dueLabel = (record: ReviewRecord | undefined): string | null => {
    if (!record || !isInBook(record) || record.scheduling.state === State.New) return null
    const dueMs = Date.parse(record.scheduling.due) - now.getTime()
    if (dueMs <= 0) return t('dueNow')
    const { value, unit } = intervalParts(dueMs)
    return t('dueIn', { interval: t(`interval.${unit}`, { value }) })
  }

  if (groups.length === 0) {
    return <p className="text-muted">{t('empty')}</p>
  }

  if (quizOpen) {
    return (
      <QuizSession
        items={quizItems}
        scope={deckId}
        onClose={() => setQuizOpen(false)}
        isSaved={isSavedId}
        onSave={saveIds}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <BookNotice records={records} />

      {/* Progress ---------------------------------------------------------- */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-muted">
          <span>{t('bookProgress', { saved: savedCount, total: totalCards, due: dueCount })}</span>
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href="/words"
              className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium underline decoration-line underline-offset-4 hover:text-ink"
            >
              {t('openBook')}
            </Link>
            <Link
              href="/review"
              className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-accent-ink underline decoration-accent-line underline-offset-4"
            >
              {t('openReview')}
            </Link>
            <button
              type="button"
              onClick={() => setListView((value) => !value)}
              className="min-h-11 rounded-lg px-2 underline decoration-line underline-offset-4 hover:text-ink"
            >
              {listView ? t('cardView') : t('listView')}
            </button>
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={savedCount}
          aria-valuemin={0}
          aria-valuemax={totalCards}
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-raised"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${totalCards === 0 ? 0 : (savedCount / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* Group tabs -------------------------------------------------------- */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            onClick={() => setGroupKey(group.key)}
            aria-current={group.key === activeGroup?.key ? 'true' : undefined}
            className={cn(
              'min-h-11 shrink-0 rounded-xl border px-3 text-sm font-medium whitespace-nowrap',
              group.key === activeGroup?.key
                ? 'border-accent-line bg-accent-soft text-accent-ink'
                : 'border-line text-muted hover:border-accent-line hover:text-ink',
            )}
          >
            {set.hasMeanings || group.key !== 'common' ? t(`group.${group.key}`) : t('group.ungraded')}
            <span className="ml-1.5 font-mono text-xs opacity-70">{group.items.length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setQuizOpen(true)}
          className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
        >
          {t('openQuiz')}
        </button>
        {records !== null && unsavedInGroup.length > 0 ? (
          <button
            type="button"
            onClick={() => saveCards(unsavedInGroup)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
          >
            <SaveIcon saved={false} />
            {t('saveGroup', { count: unsavedInGroup.length })}
          </button>
        ) : null}
      </div>

      {listView ? (
        <ul className="flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line">
          {items.map((item) => {
            const record = recordFor(item)
            const saved = isSaved(item)
            const due = dueLabel(record)
            const itemNote = notes?.get(reviewCardId(deckId, item.term)) ?? null
            const first = mergeCardContent(item, itemNote).senses[0]
            return (
              <li key={item.term} className="flex gap-2 bg-surface py-2 pr-4 pl-1 sm:gap-3">
                <button
                  type="button"
                  onClick={() => toggleSaved(item)}
                  disabled={records === null}
                  aria-pressed={saved}
                  aria-label={saved ? t('unsaveWord', { word: item.display }) : t('saveWord', { word: item.display })}
                  className={cn(
                    'grid size-11 shrink-0 place-items-center rounded-xl',
                    saved ? 'text-accent-ink' : 'text-faint hover:text-ink',
                  )}
                >
                  <SaveIcon saved={saved} />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1 py-1 sm:flex-row sm:gap-4">
                  <div className="flex min-w-0 items-baseline gap-2 sm:w-56 sm:shrink-0">
                    <span className="font-medium">{item.display}</span>
                    {item.ipa ? <span className="font-mono text-xs text-faint">{item.ipa}</span> : null}
                  </div>
                <div className="min-w-0 flex-1">
                  <p className="text-pretty">
                    {first?.meaningVi || item.meaningVi || <span className="text-faint">{t('noMeaning')}</span>}
                    {first?.origin === 'note' ? (
                      <span className="ml-2 text-xs text-faint">{t('note.originNote')}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-muted italic">
                    “{item.context}” · {formatTimestamp(item.startMs)}
                  </p>
                </div>
                  {record && saved ? (
                    <span className="shrink-0 self-start text-xs text-muted sm:text-right">
                      {t(`state.${STATE_KEY[record.scheduling.state] ?? 'new'}`)}
                      {due ? <span className="block text-faint">{due}</span> : null}
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        card &&
        currentId &&
        currentContent && (
          <>
            <FlipCard
              content={{ ...card, senses: currentContent.senses }}
              flipped={flipped}
              onFlip={() => setFlipped((value) => !value)}
              badge={
                currentRecord && currentSaved
                  ? [t(`state.${STATE_KEY[currentRecord.scheduling.state] ?? 'new'}`), dueLabel(currentRecord)]
                      .filter(Boolean)
                      .join(' · ')
                  : t('notSaved')
              }
            />

            <button
              type="button"
              onClick={() => toggleSaved(card)}
              disabled={records === null}
              aria-pressed={currentSaved}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl border px-4 text-sm font-medium',
                currentSaved
                  ? 'border-accent-line bg-accent-soft text-accent-ink'
                  : 'border-line hover:border-accent-line hover:text-accent-ink',
              )}
            >
              <SaveIcon saved={currentSaved} />
              {currentSaved ? t('saved') : t('save')}
            </button>

            {/* Grading appears only after the answer has been seen, and only for saved words. */}
            {flipped && currentRecord && currentSaved ? (
              <RatingBar
                record={currentRecord}
                scheduler={scheduler}
                now={reviewAt}
                onRate={(g) => void rate(g)}
              />
            ) : (
              <p className="text-center text-sm text-muted text-pretty">
                {currentSaved ? t('rateHint') : t('saveHint')}
              </p>
            )}

            {flipped && notes !== null ? (
              <NoteEditor
                cardId={currentId}
                note={currentNote}
                modelSenses={card.senses}
                onSave={(senses) => saveNote({ id: currentId, senses, updatedAt: new Date().toISOString() })}
                onRemove={() => removeNote(currentId)}
                onAdopt={async (sense) => {
                  const next = adoptAsInTranscript(currentNote, currentId, sense, new Date())
                  if (!next) return 'full'
                  await saveNote(next)
                  return 'ok'
                }}
              />
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label={t('previous')}
                  className="grid size-11 place-items-center rounded-xl border border-line hover:border-accent-line"
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="size-4 rotate-90 fill-current">
                    <path d="M12 16.5 5.5 10l1.4-1.4 5.1 5.1 5.1-5.1L18.5 10z" />
                  </svg>
                </button>
                <span className="min-w-16 text-center font-mono text-sm text-muted tabular-nums">
                  {position + 1}/{items.length}
                </span>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label={t('next')}
                  className="grid size-11 place-items-center rounded-xl border border-line hover:border-accent-line"
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="size-4 -rotate-90 fill-current">
                    <path d="M12 16.5 5.5 10l1.4-1.4 5.1 5.1 5.1-5.1L18.5 10z" />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                onClick={shuffle}
                className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line"
              >
                {t('shuffle')}
              </button>
            </div>

            <p className="hidden text-xs text-faint sm:block">{t('shortcutsSrs')}</p>
          </>
        )
      )}
    </div>
  )
}
