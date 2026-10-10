import { getTranslations } from 'next-intl/server'
import { parseTedSlug } from '@/lib/ingest/ted'
import { getTranscript } from '@/lib/ingest/transcript-cache'
import { assertCanOpenTalk } from '@/lib/limits/guard'
import { OG_SIZE, renderOgCard } from '@/lib/og'
import messages from '@/messages/vi.json'

export const size = OG_SIZE
export const contentType = 'image/png'
// Static for the same reason as app/opengraph-image.tsx: next-intl cannot run
// inside generateImageMetadata, and that failure removes every meta tag.
export const alt = `${messages.watch.ogNote} — ${messages.common.appName}`

/**
 * The talk's own share preview: title and speaker, drawn as text. TED's
 * thumbnail is not used — the image would be TED's, not ours to republish.
 *
 * It fetches the transcript like the page does, so it passes the same per-IP
 * limit; on any failure it falls back to the site-wide card rather than erroring.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getTranslations()
  const appName = t('common.appName')

  if (parseTedSlug(slug)) {
    try {
      await assertCanOpenTalk(slug)
      const { source } = await getTranscript(slug)
      return renderOgCard({
        appName,
        title: source.title,
        ...(source.author ? { subtitle: source.author } : {}),
        note: t('watch.ogNote'),
      })
    } catch {
      // fall through to the generic card
    }
  }

  return renderOgCard({ appName, title: t('common.tagline'), subtitle: t('hero.badge') })
}
