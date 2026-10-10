import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { toAppError } from '@/lib/errors'
import { parseTedSlug, tedTalkUrl } from '@/lib/ingest/ted'
import { assertCanOpenTalk, currentClient, mayUseModel, retryAfterMinutes } from '@/lib/limits/guard'
import { getMachineTranslation, getTranscript, needsMachineTranslation } from '@/lib/ingest/transcript-cache'
import { TranscriptError } from '@/components/watch/TranscriptError'
import { WatchView } from '@/components/watch/WatchView'
import type { Transcript } from '@/types/transcript'

/**
 * Says what this page is to a search engine: a transcript page built on a TED
 * talk, with the talk, its speaker, TED as publisher and the licence named.
 * Deliberately not a VideoObject — the video is TED's, this page is not its
 * home.
 */
function talkJsonLd(transcript: Transcript) {
  const { source } = transcript
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: source.title,
    inLanguage: transcript.lang,
    isBasedOn: {
      '@type': 'CreativeWork',
      name: source.title,
      url: source.url,
      ...(source.author ? { author: { '@type': 'Person', name: source.author } } : {}),
      publisher: { '@type': 'Organization', name: 'TED', url: 'https://www.ted.com' },
      license: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    },
  }
}

interface TedPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}

export async function generateMetadata({ params }: TedPageProps): Promise<Metadata> {
  const { slug } = await params
  if (!parseTedSlug(slug)) return {}

  try {
    // Metadata fetches the transcript too, so it must pass the same limit —
    // otherwise it would be a way to make the server call TED unchecked.
    await assertCanOpenTalk(slug)
    const { source } = await getTranscript(slug)
    const t = await getTranslations('watch')
    const description = t('metaDescription', {
      title: source.title,
      byline: source.author ? t('metaBy', { author: source.author }) : '',
    })
    return {
      title: source.title,
      description,
      // `?lang=` variants are the same talk; search engines should see one page.
      alternates: { canonical: `/watch/ted/${slug}` },
      openGraph: { type: 'article', title: source.title, description, url: `/watch/ted/${slug}` },
    }
  } catch {
    // A failed fetch is rendered as an error page; metadata should not throw.
    return {}
  }
}

export default async function TedWatchPage({ params, searchParams }: TedPageProps) {
  const { slug } = await params
  const { lang } = await searchParams

  if (!parseTedSlug(slug)) notFound()

  try {
    await assertCanOpenTalk(slug)
    const transcript = await getTranscript(slug, lang)
    const client = await currentClient()

    /*
     * Started, deliberately not awaited. The transcript is ready now; a machine
     * translation is dozens of model calls and would hold the whole page back.
     * React streams the promise to the client, which fills the Vietnamese in
     * under each line when it lands.
     */
    const machineTranslation = getMachineTranslation(slug, lang, transcript, {
      allowModel: () => mayUseModel(client, slug),
    })

    return (
      <>
        <script
          type="application/ld+json"
          // Escaped so a "</script>" inside a title cannot end the tag early.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(talkJsonLd(transcript)).replace(/</g, '\\u003c') }}
        />
        <WatchView
          transcript={transcript}
          machineTranslation={machineTranslation}
          browserFallback={needsMachineTranslation(transcript)}
        />
      </>
    )
  } catch (error) {
    const appError = toAppError(error)
    console.error(`[watch/ted] ${slug} failed with ${appError.code}:`, appError.message)
    return (
      <TranscriptError
        code={appError.code}
        videoUrl={tedTalkUrl(slug)}
        retryAfterMinutes={retryAfterMinutes(error)}
      />
    )
  }
}
