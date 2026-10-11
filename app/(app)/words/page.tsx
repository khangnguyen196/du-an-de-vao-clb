import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { WordBook } from '@/components/study/WordBook'
import { StorageNotice } from '@/components/study/StorageNotice'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wordBook')
  // Personal, browser-only data: nothing here for a search engine.
  return { title: t('title'), robots: { index: false, follow: true } }
}

/**
 * The word book lives in the browser for now, so everything below the heading
 * is a client component; the server only renders the frame.
 */
export default async function WordsPage() {
  const t = await getTranslations('wordBook')

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
          <path d="M14 6.5 12.6 5 6 11.6l6.6 6.6L14 16.8l-5.2-5.2z" />
        </svg>
        {t('backHome')}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 text-muted text-pretty">{t('subtitle')}</p>

      <div className="mt-8">
        <WordBook />
      </div>

      <p className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-faint text-pretty">
        <StorageNotice namespace="wordBook" />
      </p>
    </main>
  )
}
