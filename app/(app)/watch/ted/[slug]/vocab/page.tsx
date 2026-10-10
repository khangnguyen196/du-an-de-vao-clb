import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { FlashcardDeck } from '@/components/study/FlashcardDeck'
import { TranscriptError } from '@/components/watch/TranscriptError'
import { toAppError } from '@/lib/errors'
import { parseTedSlug, tedTalkUrl } from '@/lib/ingest/ted'
import { assertCanOpenTalk, currentClient, mayUseModel, retryAfterMinutes } from '@/lib/limits/guard'
import { getTranscript } from '@/lib/ingest/transcript-cache'
import { buildVocabSet } from '@/lib/study/vocab-set'

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

  const client = await currentClient()
  const set = await buildVocabSet(transcript, { allowModel: () => mayUseModel(client, slug) })
  const issue = set.aiIssue ?? 'no-key'

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

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {t('title')} — {transcript.source.title}
      </h1>
      <p className="mt-2 text-muted text-pretty">{t('subtitle')}</p>

      {/*
        Shown whenever the deck came out of the deterministic path alone. The
        user must never be left guessing why the backs of the cards are empty.
        The public deployment runs with no key on purpose, so the main copy
        speaks to learners; how to fix it (.env.local, credit) is for whoever
        runs `next dev` and is never shown to visitors.
      */}
      {!set.hasMeanings ? (
        <div role="status" className="mt-6 rounded-card border border-accent-line bg-accent-soft p-4">
          <p className="font-medium text-accent-ink">{t(`aiIssue.${issue}.title`)}</p>
          <p className="mt-1 text-sm leading-relaxed text-accent-ink/90 text-pretty">{t(`aiIssue.${issue}.body`)}</p>
          {process.env.NODE_ENV === 'development' ? (
            <p className="mt-3 border-t border-accent-line pt-3 text-xs leading-relaxed text-accent-ink/80 text-pretty">
              <span className="font-medium">
                {t('aiIssueDevLabel')} {t(`aiIssue.${issue}.devTitle`)}.
              </span>{' '}
              {t(`aiIssue.${issue}.devHint`)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8">
        <FlashcardDeck
          set={set}
          deckId={`ted:${slug}`}
          sourceTitle={transcript.source.title}
          sourcePath={`/watch/ted/${slug}/vocab`}
        />
      </div>

      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        <a
          href={transcript.source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t('attribution', { title: transcript.source.title })}
        </a>
      </footer>
    </main>
  )
}
