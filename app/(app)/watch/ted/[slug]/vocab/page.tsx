import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { VocabTable } from '@/components/study/VocabTable'
import { TranscriptError } from '@/components/watch/TranscriptError'
import { toAppError } from '@/lib/errors'
import { parseTedSlug, tedTalkUrl } from '@/lib/ingest/ted'
import { assertCanOpenTalk, retryAfterMinutes } from '@/lib/limits/guard'
import { getTranscript } from '@/lib/ingest/transcript-cache'
import { buildWordList } from '@/lib/study/vocab-set'

interface VocabPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: VocabPageProps): Promise<Metadata> {
  const { slug } = await params
  if (!parseTedSlug(slug)) return {}

  const t = await getTranslations('vocab')
  try {
    await assertCanOpenTalk(slug)
    const { source } = await getTranscript(slug)
    // Same words as the talk page, nothing new for search — and each crawl costs a transcript fetch.
    return { title: `${t('title')} — ${source.title}`, robots: { index: false, follow: true } }
  } catch {
    return {}
  }
}

export default async function VocabPage({ params }: VocabPageProps) {
  const { slug } = await params
  if (!parseTedSlug(slug)) notFound()

  const t = await getTranslations('vocab')

  let transcript
  try {
    await assertCanOpenTalk(slug)
    transcript = await getTranscript(slug)
  } catch (error) {
    const appError = toAppError(error)
    console.error(`[vocab] ${slug} failed with ${appError.code}:`, appError.message)
    return (
      <TranscriptError
        code={appError.code}
        videoUrl={tedTalkUrl(slug)}
        retryAfterMinutes={retryAfterMinutes(error)}
      />
    )
  }

  // No model here: meanings are the learner's to write (see `buildWordList`).
  const set = buildWordList(transcript)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/watch/ted/${slug}`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
          <path d="M14 6.5 12.6 5 6 11.6l6.6 6.6L14 16.8l-5.2-5.2z" />
        </svg>
        {t('backToTranscript')}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-muted text-pretty">{transcript.source.title}</p>

      <div className="mt-6">
        <VocabTable
          set={set}
          deckId={`ted:${slug}`}
          sourceTitle={transcript.source.title}
          sourcePath={`/watch/ted/${slug}/vocab`}
        />
      </div>

      <footer className="mt-10 flex flex-col gap-1 border-t border-line pt-4 text-xs text-muted">
        <a
          href={transcript.source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t('attribution', { title: transcript.source.title })}
        </a>
        <p className="leading-relaxed text-faint text-pretty">{t('dictCredit')}</p>
      </footer>
    </main>
  )
}
