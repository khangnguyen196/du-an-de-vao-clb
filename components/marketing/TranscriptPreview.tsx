import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PREVIEW_EXCERPT } from '@/lib/featured-talks'
import { formatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

/** Delay per line so the highlight walks down the list; see `.line-glow`. */
const LINE_DELAYS = ['0s', '-6s', '-3s'] as const

/**
 * Animated illustration of the watch screen, framed like a device on a desk:
 * the "now playing" highlight walks down the lines, the progress bar runs, a
 * few chips float around the frame (wide screens only, where there is room).
 *
 * Built from a real sample talk: TED's own photo of it, and three lines it
 * really contains with the TED community's translation (`PREVIEW_EXCERPT`).
 * A real speaker's face is never paired with words they did not say, so if
 * the photo changes, the lines must change with it.
 */
export function TranscriptPreview() {
  const t = useTranslations('preview')
  const ta = useTranslations('art')
  const { talk, lines, restingIndex } = PREVIEW_EXCERPT
  const restingTime = formatTimestamp(lines[restingIndex]!.startMs)

  return (
    <figure className="relative">
      <FloatingChip className="top-10 -left-10" delay="0s" dot="bg-violet-500">
        {ta('chipPlaying', { time: restingTime })}
      </FloatingChip>
      <FloatingChip className="top-1/3 -right-12" delay="-2s" dot="bg-orange-500">
        {ta('chipSaved', { word: 'memorable' })}
      </FloatingChip>
      <FloatingChip className="bottom-24 -left-14" delay="-4s" dot="bg-fuchsia-500">
        {ta('chipDue')}
      </FloatingChip>
      <FloatingChip className="-right-8 bottom-10" delay="-1s" dot="bg-red-500">
        {ta('chipBilingual')}
      </FloatingChip>

      <div
        aria-hidden
        className="rounded-[1.75rem] border border-line bg-surface/70 p-2 shadow-[0_30px_80px_-30px_rgb(17_24_39/0.45)] backdrop-blur sm:p-3"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-2.5 sm:px-3">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 h-5 flex-1 rounded-full bg-raised sm:max-w-xs" />
        </div>

        <div className="grid gap-3 rounded-[1.25rem] border border-line bg-canvas p-3 sm:p-4 lg:grid-cols-[1.2fr_1fr] lg:gap-5">
          {/* Player stand-in */}
          <div className="relative flex aspect-video flex-col justify-between overflow-hidden rounded-xl bg-black p-3">
            <Image
              src={talk.image}
              alt=""
              fill
              sizes="(min-width: 1024px) 34rem, 100vw"
              className="object-cover"
            />
            {/* Darkens the photo at top and bottom so the badge and the time stay readable. */}
            <span className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />
            <span className="relative flex items-center gap-2 self-start rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <span className="flex h-3 items-end gap-0.5">
                {['0s', '-0.4s', '-0.8s', '-0.2s'].map((delay) => (
                  <span key={delay} className="eq-bar block h-3 w-0.5 rounded-full bg-white" style={{ animationDelay: delay }} />
                ))}
              </span>
              {t('nowPlaying')}
            </span>
            <span className="relative grid size-14 place-items-center self-center">
              <span className="pulse-ring absolute inset-0 rounded-full bg-white" />
              <span className="relative grid size-14 place-items-center rounded-full bg-white/95 text-black shadow-lg">
                <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current" role="presentation">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
            <span className="relative flex items-center gap-2">
              <span className="font-mono text-[11px] text-white/90">{restingTime}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/35">
                <span className="progress-run block h-full w-full rounded-full bg-white" />
              </span>
              <span className="font-mono text-[11px] text-white/90">{formatTimestamp(talk.durationMs)}</span>
            </span>
          </div>

          {/* Transcript stand-in */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-sm font-semibold">{t('title')}</span>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">
                {t('nowPlaying')}
              </span>
            </div>

            <ul className="mt-1 flex flex-col">
              {lines.map((line, index) => (
                <li key={line.startMs} className="relative flex gap-3 rounded-lg px-2 py-2.5 text-sm leading-relaxed">
                  {/* The moving highlight: background and left bar, faded in turn. */}
                  <span
                    className={cn(
                      'line-glow absolute inset-0 rounded-lg border-l-2 border-accent bg-accent-soft/70',
                      index === restingIndex && 'is-lit',
                    )}
                    style={{ animationDelay: LINE_DELAYS[index] }}
                  />
                  <span className="relative shrink-0 font-mono text-xs text-accent-ink">{formatTimestamp(line.startMs)}</span>
                  <span className="relative min-w-0">
                    <span lang="en" className="block text-pretty text-ink">{line.en}</span>
                    <span className="mt-1 block border-l-2 border-line pl-2 text-xs text-muted text-pretty">
                      {line.vi}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-faint text-pretty">
        {t('credit', { title: talk.title, speaker: talk.speaker })}{' '}
        <Link
          href={`/watch/ted/${talk.slug}`}
          className="inline-flex min-h-11 items-center font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t('openTalk')}
        </Link>
      </figcaption>
    </figure>
  )
}

/** A floating badge beside the frame — decoration, so hidden from screen readers. */
function FloatingChip({
  children,
  className,
  delay,
  dot,
}: {
  children: React.ReactNode
  className: string
  delay: string
  dot: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'float-y absolute z-10 hidden items-center gap-2 rounded-full border border-line bg-surface/90 px-3.5 py-2 text-sm font-medium whitespace-nowrap text-ink shadow-[0_12px_30px_-12px_rgb(17_24_39/0.35)] backdrop-blur xl:flex',
        className,
      )}
      style={{ animationDelay: delay }}
    >
      <span className={cn('size-2 rounded-full', dot)} />
      {children}
    </span>
  )
}
