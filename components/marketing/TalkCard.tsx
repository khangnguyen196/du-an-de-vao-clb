import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { FeaturedTalk } from '@/lib/featured-talks'

/**
 * A sample talk as a 16:9 photo card: TED's own photo of the talk, the title
 * and speaker set over a dark fade, duration and "bilingual" chips on top.
 *
 * Motion (globals.css): the photo drifts slowly on its own; hover or keyboard
 * focus lifts the card, leans the photo in and brings up the play mark. On a
 * touch screen the play mark is simply always there — nothing is hover-only.
 */
export function TalkCard({ talk, index }: { talk: FeaturedTalk; index: number }) {
  const t = useTranslations('try')

  return (
    <Link
      href={`/watch/ted/${talk.slug}`}
      aria-label={t('open', { title: talk.title, speaker: talk.speaker })}
      className="thumb-card group block rounded-card shadow-[0_10px_30px_-12px_rgb(17_24_39/0.35)]"
    >
      <span className="relative block aspect-video overflow-hidden rounded-card bg-raised">
        <span className="thumb-zoom absolute inset-0 block">
          <Image
            src={talk.image}
            alt={t('imageAlt', { speaker: talk.speaker })}
            fill
            sizes="(min-width: 1024px) 18rem, (min-width: 640px) 50vw, 100vw"
            // Above the fold on no screen size; let the browser defer them.
            loading="lazy"
            className="thumb-drift object-cover"
            // Each card starts at a different point of the drift, so the grid
            // never moves in lockstep.
            style={{ animationDelay: `${String(-index * 2.7)}s` }}
          />
        </span>

        {/* Fade for legible white text, whatever the photo. */}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/0" />

        <span className="absolute top-2.5 right-2.5 left-2.5 flex items-center justify-between gap-2">
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {t('minutes', { minutes: Math.round(talk.durationMs / 60_000) })}
          </span>
          <span className="bg-brand-gradient rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            {t('bilingual')}
          </span>
        </span>

        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <span className="thumb-play grid size-14 place-items-center rounded-full bg-white/95 text-black shadow-lg">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>

        <span className="absolute inset-x-0 bottom-0 block p-3.5 sm:p-4">
          <span className="line-clamp-2 block text-base leading-snug font-semibold text-balance text-white">
            {talk.title}
          </span>
          <span className="mt-1 block truncate text-sm text-white/75">{talk.speaker}</span>
        </span>
      </span>
    </Link>
  )
}
