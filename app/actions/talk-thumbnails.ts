'use server'

import { z } from 'zod'
import { fetchTedTalkInfo } from '@/lib/ingest/ted'
import { assertCanOpenTalk } from '@/lib/limits/guard'
import { isTedImageUrl } from '@/lib/ted-images'

const TalkThumbnailsInput = z.strictObject({
  slugs: z.array(z.string().regex(/^[a-z0-9_]+$/i).max(200)).max(6),
})

/**
 * TED's photo for each talk, by slug — for "talks you opened" suggestions
 * saved before photos were kept. Asked once per talk by the client, which then
 * stores the answer; misses are simply left out.
 *
 * Goes through the per-IP talk limit like any other TED lookup, and reads the
 * same day-long page cache as the watch page, so it is cheap for talks
 * someone has opened recently — which is the only kind it is asked about.
 */
export async function talkThumbnails(input: unknown): Promise<Record<string, string>> {
  const parsed = TalkThumbnailsInput.safeParse(input)
  if (!parsed.success) return {}

  const found: Record<string, string> = {}
  await Promise.all(
    parsed.data.slugs.map(async (slug) => {
      try {
        await assertCanOpenTalk(slug)
        const { thumbnailUrl } = await fetchTedTalkInfo(slug)
        if (thumbnailUrl && isTedImageUrl(thumbnailUrl)) found[slug] = thumbnailUrl
      } catch {
        /* no photo for this one — the list shows its placeholder */
      }
    }),
  )
  return found
}
