import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { UrlForm } from '@/components/marketing/UrlForm'
import type { ErrorCode } from '@/lib/errors'

/**
 * A failed ingest must say *why* it failed — "no captions" and "YouTube blocked
 * us" need completely different reactions from the user.
 */
export function TranscriptError({
  code,
  videoUrl,
  retryAfterMinutes = null,
}: {
  code: ErrorCode
  videoUrl?: string
  /** Set when a per-client limit refused the request, so the page can say how long to wait. */
  retryAfterMinutes?: number | null
}) {
  const t = useTranslations()

  return (
    <main className="mx-auto flex min-h-screen-dvh w-full max-w-xl flex-col justify-center px-4 py-16 sm:px-6">
      <p className="font-mono text-xs tracking-wide text-faint uppercase">{code}</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {t('errors.title')}
      </h1>
      <p className="mt-3 leading-relaxed text-muted text-pretty">
        {retryAfterMinutes !== null
          ? t('errors.RATE_LIMITED_TALKS', { minutes: retryAfterMinutes })
          : t(`errors.${code}`)}
      </p>

      <div className="mt-8">
        <UrlForm size="md" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/" className="text-muted underline decoration-line underline-offset-4 hover:text-ink">
          {t('watch.backHome')}
        </Link>
        {videoUrl ? (
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted underline decoration-line underline-offset-4 hover:text-ink"
          >
            {t('watch.openOriginal')}
          </a>
        ) : null}
      </div>
    </main>
  )
}
