'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rating, State } from 'ts-fsrs'
import { BookNotice } from '@/components/study/BookNotice'
import { FlipCard } from '@/components/study/FlipCard'
import { NoteEditor } from '@/components/study/NoteEditor'
import { RatingBar } from '@/components/study/RatingBar'
import { adoptAsInTranscript, mergeCardContent } from '@/lib/study/card-content'
import { shouldIgnoreShortcut } from '@/lib/study/keyboard'
import { bookRecords, buildQueue, DEFAULT_NEW_PER_DAY, grade, intervalParts, type SrsGrade } from '@/lib/study/srs'
import { useNotes } from '@/lib/study/use-notes'
import { useNow, useReviewRecords } from '@/lib/study/use-review'

const KEY_TO_GRADE: Record<string, SrsGrade> = {
  '1': Rating.Again,
  '2': Rating.Hard,
  '3': Rating.Good,
  '4': Rating.Easy,
}

const STATE_KEY: Record<number, 'new' | 'learning' | 'review' | 'relearning'> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
}

/**
 * The cross-talk review queue. Everything is recomputed from stored records on
 * each render, so there is no separate "session" state that could disagree
 * with what is actually due.
 */
export function ReviewSession() {
  const t = useTranslations('review')
  const tv = useTranslations('vocab')
  const { records, scheduler, save } = useReviewRecords()
  const { notes, save: saveNote, remove: removeNote } = useNotes()
  const now = useNow()
  const [flipped, setFlipped] = useState(false)
  /**
   * Captured on flip and used for both the interval preview and the grade:
   * FSRS fuzz is seeded by review time, so one clock keeps the promise on each
   * button identical to what gets stored.
   */
  const [reviewAt, setReviewAt] = useState(() => new Date())
  const rating = useRef(false)

  // Only words in the word book are reviewed; the rest keep their progress, unseen.
  const book = useMemo(() => (records ? bookRecords(records) : null), [records])
  const queue = useMemo(() => (book ? buildQueue(book, now) : null), [book, now])
  const current = queue ? (queue.due[0] ?? queue.fresh[0]) : undefined
  const remaining = queue ? queue.due.length + queue.fresh.length : 0
  const currentNote = current ? (notes?.get(current.id) ?? null) : null

  // A different card on top means a fresh, unflipped face.
  const currentId = current?.id
  useEffect(() => {
    setFlipped(false)
  }, [currentId])

  useEffect(() => {
    if (flipped) setReviewAt(new Date())
  }, [flipped, currentId])

  const rate = useCallback(
    async (value: SrsGrade) => {
      if (!current || rating.current) return
      rating.current = true
      try {
        await save([grade(current, value, reviewAt, scheduler)])
      } finally {
        rating.current = false
      }
    },
    [current, reviewAt, save, scheduler],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Writing a note must never flip or grade the card underneath it.
      if (shouldIgnoreShortcut(event)) return

      if (event.code === 'Space') {
        event.preventDefault()
        setFlipped((value) => !value)
      } else if (flipped && KEY_TO_GRADE[event.key] !== undefined) {
        void rate(KEY_TO_GRADE[event.key]!)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flipped, rate])

  if (!queue || !records || !book) {
    return <p className="text-muted">{t('loading')}</p>
  }

  if (book.length === 0) {
    return (
      <div className="flex flex-col gap-4">
      <BookNotice records={records} />
      <div className="rounded-card border border-line bg-surface p-6">
        <p className="font-medium">{t('noCardsTitle')}</p>
        <p className="mt-1 text-sm text-muted text-pretty">{t('noCardsBody')}</p>
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

  const header = (
    <>
      <BookNotice records={records} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted">
        <span>{t('counts', { due: queue.counts.due, fresh: queue.fresh.length })}</span>
        <span className="text-faint">{t('newCap', { count: DEFAULT_NEW_PER_DAY })}</span>
      </div>
    </>
  )

  if (!current) {
    const next = queue.nextDueAt
    const wait = next ? intervalParts(next.getTime() - now.getTime()) : null
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="rounded-card border border-line bg-surface p-6">
          <p className="font-medium">{t('doneTitle')}</p>
          <p className="mt-1 text-sm text-muted">
            {wait
              ? t('nextDue', { interval: tv(`interval.${wait.unit}`, { value: wait.value }) })
              : t('nothingScheduled')}
          </p>
        </div>
      </div>
    )
  }

  const merged = mergeCardContent(current.snapshot, currentNote)

  return (
    <div className="flex flex-col gap-4">
      {header}

      <FlipCard
        content={{ ...current.snapshot, senses: merged.senses }}
        flipped={flipped}
        onFlip={() => setFlipped((value) => !value)}
        badge={`${tv(`state.${STATE_KEY[current.scheduling.state] ?? 'new'}`)} · ${t('remaining', { count: remaining })}`}
      />

      {flipped ? (
        <RatingBar record={current} scheduler={scheduler} now={reviewAt} onRate={(g) => void rate(g)} />
      ) : (
        <p className="text-center text-sm text-muted">{tv('rateHint')}</p>
      )}

      {flipped && notes !== null ? (
        <NoteEditor
          cardId={current.id}
          note={currentNote}
          modelSenses={current.snapshot.senses ?? []}
          onSave={(senses) => saveNote({ id: current.id, senses, updatedAt: new Date().toISOString() })}
          onRemove={() => removeNote(current.id)}
          onAdopt={async (sense) => {
            const next = adoptAsInTranscript(currentNote, current.id, sense, new Date())
            if (!next) return 'full'
            await saveNote(next)
            return 'ok'
          }}
        />
      ) : null}

      <Link
        href={current.snapshot.sourcePath}
        className="inline-flex min-h-11 w-fit items-center text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
      >
        {t('fromTalk', { title: current.snapshot.sourceTitle })}
      </Link>
    </div>
  )
}
