import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations()

  return (
    <main className="mx-auto flex min-h-screen-dvh w-full max-w-xl flex-col justify-center px-4 sm:px-6">
      <p className="font-mono text-xs tracking-wide text-faint uppercase">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('errors.VIDEO_UNAVAILABLE')}
      </h1>
      <Link
        href="/"
        className="mt-6 inline-flex w-fit text-muted underline decoration-line underline-offset-4 hover:text-ink"
      >
        {t('watch.backHome')}
      </Link>
    </main>
  )
}
