import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

const LINES = ['one', 'two', 'three'] as const
/** The line drawn as "now playing" — what the watch screen really does. */
const ACTIVE = 'two'

/**
 * Static illustration of the watch screen. Its lines are invented and say so
 * on screen; nothing here is fetched or quoted from a real talk.
 */
export function TranscriptPreview() {
  const t = useTranslations('preview')

  return (
    <figure>
      <div
        aria-hidden
        className="grid gap-4 rounded-card border border-line bg-surface p-3 shadow-sm sm:p-4 lg:grid-cols-[1.15fr_1fr] lg:gap-5"
      >
        {/* Player stand-in */}
        <div className="flex aspect-video items-center justify-center rounded-xl bg-ink/90">
          <span className="grid size-14 place-items-center rounded-full bg-canvas/95">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-ink" role="presentation">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>

        {/* Transcript stand-in */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <span className="text-sm font-medium">{t('title')}</span>
            <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent-ink">
              {t('nowPlaying')}
            </span>
          </div>

          <ul className="mt-1 flex flex-col">
            {LINES.map((line) => {
              const active = line === ACTIVE
              return (
                <li
                  key={line}
                  className={cn(
                    'flex gap-3 rounded-lg border-l-2 px-2 py-2.5 text-sm leading-relaxed',
                    active ? 'border-accent bg-raised' : 'border-transparent',
                  )}
                >
                  <span className={cn('shrink-0 font-mono text-xs', active ? 'text-accent-ink' : 'text-faint')}>
                    {t(`lines.${line}.time`)}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-pretty', active ? 'text-ink' : 'text-muted')}>
                      {t(`lines.${line}.en`)}
                    </span>
                    <span className="mt-1 block border-l-2 border-line pl-2 text-xs text-muted text-pretty">
                      {t(`lines.${line}.vi`)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-faint">{t('note')}</figcaption>
    </figure>
  )
}
