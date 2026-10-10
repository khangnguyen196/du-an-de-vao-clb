import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/**
 * Small animated sketches of the real screens, one per feature card: the
 * playing line walks down, the flashcard turns over, the chosen rating
 * breathes. Purely decorative (aria-hidden): the card's heading and text carry
 * the meaning. Sample words are generic, never quoted from a real talk. All
 * motion is the shared loops in globals.css, so reduced motion stills it.
 */
export type FeatureArtKind = 'sync' | 'bilingual' | 'search' | 'export' | 'cards' | 'book' | 'srs' | 'quiz'

const chip = 'rounded-lg border border-white/60 bg-white/85 text-gray-900 shadow-sm backdrop-blur-sm'
const LINE_DELAYS = ['0s', '-6s', '-3s'] as const

export function FeatureArt({ kind }: { kind: FeatureArtKind }) {
  const t = useTranslations('art')

  return (
    // Equal height only where cards sit side by side; stacked on a phone, the
    // reserve would just be an empty gap under the text.
    <div aria-hidden className="flex flex-col justify-center gap-2 text-left text-[13px] leading-snug sm:min-h-36">
      {kind === 'sync'
        ? (
            [
              ['0:42', t('lineOne')],
              ['0:47', t('lineTwo')],
              ['0:51', t('lineThree')],
            ] as const
          ).map(([time, text], index) => (
            <div key={time} className={cn(chip, 'relative flex items-start gap-2.5 overflow-hidden px-3 py-2')}>
              <span
                className={cn('line-glow absolute inset-0 border-l-4 border-violet-600 bg-violet-100', index === 1 && 'is-lit')}
                style={{ animationDelay: LINE_DELAYS[index] }}
              />
              <span className="relative shrink-0 font-mono text-xs text-violet-700">{time}</span>
              <span className="relative min-w-0 flex-1">{text}</span>
            </div>
          ))
        : null}

      {kind === 'bilingual' ? (
        <div className={cn(chip, 'p-3')}>
          <p className="font-medium">{t('lineTwo')}</p>
          <p className="blink-soft mt-1.5 border-l-2 border-violet-400 pl-2 text-gray-600">{t('lineTwoVi')}</p>
        </div>
      ) : null}

      {kind === 'search' ? (
        <>
          <div className={cn(chip, 'flex items-center gap-2 rounded-full px-3 py-2')}>
            <svg viewBox="0 0 24 24" className="size-4 fill-gray-500">
              <path d="M10 4a6 6 0 1 0 3.5 10.9l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" />
            </svg>
            <span className="flex-1 font-medium">
              {t('searchTerm')}
              <span className="blink-soft ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-gray-700" />
            </span>
            <span className="font-mono text-xs text-gray-500">3/12</span>
          </div>
          <div className={cn(chip, 'px-3 py-2')}>
            {t('searchHitBefore')}{' '}
            <mark className="glow-pulse inline-block rounded bg-violet-200 px-0.5 text-violet-900">{t('searchTerm')}</mark>{' '}
            {t('searchHitAfter')}
          </div>
        </>
      ) : null}

      {kind === 'export' ? (
        <div className="grid grid-cols-2 gap-2">
          {['.txt', '.srt', '.vtt', '.md'].map((ext, index) => (
            <span
              key={ext}
              className={cn(chip, 'float-y flex items-center gap-2 px-3 py-2.5 font-mono text-xs font-medium')}
              style={{ animationDelay: `${String(-index * 1.5)}s` }}
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-violet-600">
                <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5Z" />
              </svg>
              {ext}
            </span>
          ))}
        </div>
      ) : null}

      {kind === 'cards' ? (
        <div className="[perspective:900px]">
          <div className="flip-loop relative min-h-28">
            <div className={cn(chip, 'absolute inset-0 flex flex-col items-center justify-center p-3.5 text-center')}>
              <p className="text-lg font-semibold">{t('cardWord')}</p>
              <p className="font-mono text-xs text-gray-500">{t('cardIpa')}</p>
              <p className="mt-2 text-xs text-gray-600">
                <span className="font-mono text-violet-700">2:14</span> · {t('cardContext')}
              </p>
            </div>
            <div
              className={cn(
                chip,
                'absolute inset-0 flex flex-col items-center justify-center p-3.5 text-center [transform:rotateY(180deg)]',
              )}
            >
              <p className="text-xs font-medium tracking-wide text-violet-700 uppercase">{t('cardWord')}</p>
              <p className="mt-1 text-lg font-semibold">{t('cardMeaning')}</p>
            </div>
          </div>
        </div>
      ) : null}

      {kind === 'book' ? (
        <>
          {(['bookOne', 'bookTwo', 'bookThree'] as const).map((key, index) => (
            <div key={key} className={cn(chip, 'flex items-center gap-2 px-3 py-2')}>
              <span
                className={cn(
                  'relative grid size-4 place-items-center rounded border',
                  index < 2 ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300',
                )}
              >
                {index < 2 ? (
                  <Check />
                ) : (
                  // The third word keeps getting saved.
                  <span className="pop-loop absolute -inset-px grid place-items-center rounded bg-violet-600 text-white">
                    <Check />
                  </span>
                )}
              </span>
              <span className="font-medium">{t(key)}</span>
            </div>
          ))}
        </>
      ) : null}

      {kind === 'srs' ? (
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              ['again', '1m'],
              ['hard', '6m'],
              ['good', '1d'],
              ['easy', '4d'],
            ] as const
          ).map(([key, gap]) => (
            <span
              key={key}
              className={cn(
                chip,
                'flex flex-col items-center px-1 py-2',
                key === 'good' && 'glow-pulse ring-2 ring-violet-500',
              )}
            >
              <span className="text-xs font-semibold">{t(`rate.${key}`)}</span>
              <span className="font-mono text-[11px] text-gray-500">{gap}</span>
            </span>
          ))}
        </div>
      ) : null}

      {kind === 'quiz' ? (
        <>
          <div className={cn(chip, 'px-3 py-2 font-medium')}>{t('quizPrompt')}</div>
          <div className="grid grid-cols-2 gap-1.5">
            <span className={cn(chip, 'relative flex items-center gap-1.5 px-3 py-2 ring-2 ring-emerald-500')}>
              <span className="pop-loop grid size-4 place-items-center rounded-full bg-emerald-500 text-white">
                <Check />
              </span>
              {t('quizRight')}
            </span>
            <span className={cn(chip, 'px-3 py-2 text-gray-500')}>{t('quizWrong')}</span>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="size-3 fill-current">
      <path d="m9.5 16.2-4-4L4 13.7l5.5 5.5L20 8.7l-1.4-1.4z" />
    </svg>
  )
}
