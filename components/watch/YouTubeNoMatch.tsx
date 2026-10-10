import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { UrlForm } from '@/components/marketing/UrlForm'
import { tedSearchQuery, youtubeWatchUrl, type YouTubeTedMatch } from '@/lib/ingest/youtube-ted'

type NoMatch = Exclude<YouTubeTedMatch, { status: 'found' }>

/**
 * A YouTube link that did not lead to a ted.com talk. Each case needs a
 * different next step — search TED by hand, give up on a TEDx-only talk, or
 * paste a different link — so each says which.
 */
export function YouTubeNoMatch({ videoId, match }: { videoId: string; match: NoMatch }) {
  const t = useTranslations('youtube')
  const tw = useTranslations('watch')

  const key = match.status === 'unavailable' ? 'unavailable' : match.kind
  const searchHref =
    match.status === 'not-found' && match.kind !== 'other'
      ? `https://www.ted.com/search?q=${encodeURIComponent(tedSearchQuery(match.title))}`
      : null

  return (
    <main className="mx-auto flex min-h-screen-dvh w-full max-w-2xl flex-col justify-center px-4 py-16 sm:px-6">
      <p className="font-mono text-xs tracking-wide text-faint uppercase">YouTube · {videoId}</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{t(`${key}.title`)}</h1>

      {match.status === 'not-found' ? (
        <p className="mt-3 text-sm text-muted">
          {t('videoLine', { title: match.title, channel: match.channel })}
        </p>
      ) : null}

      <p className="mt-3 leading-relaxed text-muted text-pretty">{t(`${key}.body`)}</p>

      {searchHref ? (
        <a
          href={searchHref}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 inline-flex min-h-11 w-fit items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
        >
          {t('searchTed')}
        </a>
      ) : null}

      <div className="mt-8">
        <UrlForm size="md" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-muted underline decoration-line underline-offset-4 hover:text-ink"
        >
          {tw('backHome')}
        </Link>
        <a
          href={youtubeWatchUrl(videoId)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center text-muted underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t('openYouTube')}
        </a>
      </div>
    </main>
  )
}
