import { z } from 'zod'
import { isTedImageUrl } from '@/lib/ted-images'

/**
 * Talks this browser has opened successfully, newest first — offered again as
 * suggestions in the link box, since each one is known to work.
 *
 * Browser storage, validated on read like every other stored value: a broken
 * or foreign entry is dropped, never trusted.
 */
const KEY = 'abc:recent-talks:v1'
const MAX = 6

const RecentTalkSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9_]+$/i).max(200),
  title: z.string().min(1).max(300),
  speaker: z.string().max(200).nullable(),
  /**
   * TED's photo of the talk. Optional because entries saved before photos were
   * kept have none; the link box fills those in once (`talkThumbnails`).
   */
  image: z.string().refine(isTedImageUrl).nullable().optional(),
  openedAt: z.iso.datetime(),
})

export type RecentTalk = z.infer<typeof RecentTalkSchema>

export function readRecentTalks(): RecentTalk[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((entry) => {
      const parsed = RecentTalkSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

function write(talks: readonly RecentTalk[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(talks.slice(0, MAX)))
  } catch {
    /* storage blocked — suggestions just won't include it */
  }
}

export function rememberTalk(talk: Omit<RecentTalk, 'openedAt'>, now = new Date()): void {
  const image = talk.image && isTedImageUrl(talk.image) ? talk.image : null
  const rest = readRecentTalks().filter((entry) => entry.slug !== talk.slug)
  write([{ ...talk, image, openedAt: now.toISOString() }, ...rest])
}

/** Adds photos to stored entries that lack one, keeping order and dates. */
export function addRecentImages(images: Readonly<Record<string, string>>): RecentTalk[] {
  const updated = readRecentTalks().map((talk) => {
    const image = images[talk.slug]
    return !talk.image && image && isTedImageUrl(image) ? { ...talk, image } : talk
  })
  write(updated)
  return updated
}
