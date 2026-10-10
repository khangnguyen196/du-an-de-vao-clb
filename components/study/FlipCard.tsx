'use client'

import { useTranslations } from 'next-intl'
import type { DisplaySense } from '@/lib/study/card-content'
import { formatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { VocabCard } from '@/types/study'

export type FlipCardContent = Pick<
  VocabCard,
  'display' | 'ipa' | 'partOfSpeech' | 'meaningVi' | 'context' | 'startMs'
> & {
  /** Learner notes first, then model meanings — see `mergeCardContent`. */
  senses?: DisplaySense[]
  singleCommonSense?: boolean
}

interface FlipCardProps {
  content: FlipCardContent
  flipped: boolean
  onFlip: () => void
  /** Small label above the word, e.g. the card's scheduling state. */
  badge?: React.ReactNode
}

/**
 * The flashcard itself, shared by the per-talk deck and the review queue so the
 * two can never drift apart in how a card looks or flips.
 *
 * The back keeps three things visibly apart: meanings the learner wrote,
 * meanings the model wrote, and the real line from the talk.
 */
export function FlipCard({ content, flipped, onFlip, badge }: FlipCardProps) {
  const t = useTranslations('vocab')
  const senses = content.senses ?? []
  const hasModelSenses = senses.some((sense) => sense.origin === 'model')

  return (
    <div className="flip-scene">
      <button
        type="button"
        onClick={onFlip}
        aria-label={t('flip')}
        aria-pressed={flipped}
        className={cn('flip-card block text-left', flipped && 'is-flipped', senses.length > 1 && 'min-h-[26rem]')}
      >
        <span className="flip-face items-center justify-center gap-3 rounded-card border border-line bg-surface p-6 text-center">
          {badge ? <span className="text-xs text-faint">{badge}</span> : null}
          <span className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{content.display}</span>
          {content.ipa ? <span className="font-mono text-muted">{content.ipa}</span> : null}
          {content.partOfSpeech ? (
            <span className="rounded-full bg-raised px-3 py-1 text-xs text-muted">{content.partOfSpeech}</span>
          ) : null}
          <span className="mt-2 text-xs text-faint">{t('tapToFlip')}</span>
        </span>

        <span
          className={cn(
            'flip-face flip-face-back gap-4 rounded-card border border-line bg-surface p-5 sm:p-6',
            senses.length === 0 && 'justify-center',
          )}
        >
          {senses.length > 0 ? (
            <span className="flex flex-col gap-4">
              {senses.map((sense, index) => (
                <span key={`${sense.origin}-${index}-${sense.meaningVi}`} className="flex flex-col gap-1.5">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-mono text-xs text-faint">{index + 1}.</span>
                    <span
                      className={cn('leading-snug font-semibold text-balance', index === 0 ? 'text-xl' : 'text-base')}
                    >
                      {sense.meaningVi}
                    </span>
                    {sense.partOfSpeech ? (
                      <span className="rounded-full bg-raised px-2 py-0.5 text-xs text-muted">{sense.partOfSpeech}</span>
                    ) : null}
                    {sense.inTranscript ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">
                        {t('inTranscript')}
                      </span>
                    ) : null}
                    <span className="text-xs text-faint">
                      {sense.origin === 'note' ? t('note.originNote') : t('note.originModel')}
                    </span>
                  </span>
                  <span className="flex flex-col pl-5 text-sm leading-relaxed">
                    <span className="text-xs text-faint">{t('example')}</span>
                    <span lang="en" className="text-muted">
                      {sense.example.en}
                    </span>
                    <span className="text-faint">{sense.example.vi}</span>
                  </span>
                </span>
              ))}
              {content.singleCommonSense && hasModelSenses ? (
                <span className="text-xs text-faint">{t('singleSense')}</span>
              ) : null}
            </span>
          ) : content.meaningVi ? (
            <span className="text-2xl leading-snug font-semibold text-balance">{content.meaningVi}</span>
          ) : (
            <span className="text-muted">{t('noMeaning')}</span>
          )}

          <span className={cn('flex flex-col gap-1', senses.length > 0 && 'border-t border-line pt-3')}>
            <span className="text-xs text-faint">
              {t('sourceQuote')} · <span className="font-mono">{formatTimestamp(content.startMs)}</span>
            </span>
            <span lang="en" className="border-l-2 border-accent-line pl-3 text-sm leading-relaxed text-muted italic">
              “{content.context}”
            </span>
          </span>
        </span>
      </button>
    </div>
  )
}
