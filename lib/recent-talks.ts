import { z } from 'zod'

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

export function rememberTalk(talk: Omit<RecentTalk, 'openedAt'>, now = new Date()): void {
  try {
    const rest = readRecentTalks().filter((entry) => entry.slug !== talk.slug)
    const next = [{ ...talk, openedAt: now.toISOString() }, ...rest].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage blocked — suggestions just won't include it */
  }
}
