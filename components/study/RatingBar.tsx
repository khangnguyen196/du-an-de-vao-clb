'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { Rating } from 'ts-fsrs'
import { GRADES, intervalParts, previewDue, type Scheduler, type SrsGrade } from '@/lib/study/srs'
import type { ReviewRecord } from '@/lib/study/srs-store'
import { cn } from '@/lib/utils'

const GRADE_KEY: Record<SrsGrade, 'again' | 'hard' | 'good' | 'easy'> = {
  [Rating.Again]: 'again',
  [Rating.Hard]: 'hard',
  [Rating.Good]: 'good',
  [Rating.Easy]: 'easy',
}

interface RatingBarProps {
  record: ReviewRecord
  scheduler: Scheduler
  now: Date
  onRate: (grade: SrsGrade) => void
  disabled?: boolean
}

/**
 * The four self-assessment buttons. Each one shows when the card would come
 * back, so the learner sees the consequence of a grade before choosing it.
 */
export function RatingBar({ record, scheduler, now, onRate, disabled }: RatingBarProps) {
  const t = useTranslations('vocab')
  const due = useMemo(() => previewDue(record, now, scheduler), [record, now, scheduler])

  return (
    <div className="grid grid-cols-4 gap-2">
      {GRADES.map((grade, index) => {
        const { value, unit } = intervalParts(due[grade].getTime() - now.getTime())
        return (
          <button
            key={grade}
            type="button"
            disabled={disabled}
            onClick={() => onRate(grade)}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 text-sm font-medium',
              'disabled:opacity-50',
              grade === Rating.Again
                ? 'border-accent-line text-accent-ink hover:bg-accent-soft'
                : 'border-line hover:border-accent-line hover:bg-raised',
            )}
          >
            <span>{t(`rate.${GRADE_KEY[grade]}`)}</span>
            <span className="mt-0.5 text-xs font-normal text-muted tabular-nums">
              {t(`interval.${unit}`, { value })}
            </span>
            <span className="sr-only">({index + 1})</span>
          </button>
        )
      })}
    </div>
  )
}
