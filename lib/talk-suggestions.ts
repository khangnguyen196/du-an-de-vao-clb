import { FEATURED_TALKS, type FeaturedTalk } from '@/lib/featured-talks'
import { parseTedSlug } from '@/lib/ingest/ted'
import type { RecentTalk } from '@/lib/recent-talks'

/** A talk the link box can offer: one known to open, with what to show for it. */
export interface TalkSuggestion {
  slug: string
  title: string
  speaker: string | null
  image: string | null
  kind: 'recent' | 'featured'
}

/** Lower case without diacritics, so "brene" finds "Brené" and "dang" finds "đang". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
}

function matches(suggestion: TalkSuggestion, query: string): boolean {
  const trimmed = query.trim()
  if (trimmed.length === 0) return true

  // A pasted link or slug: match the talk it points at.
  const slug = parseTedSlug(trimmed)
  if (slug) return suggestion.slug.toLowerCase().includes(slug.toLowerCase())

  const haystack = fold(`${suggestion.title} ${suggestion.speaker ?? ''} ${suggestion.slug.replace(/_/g, ' ')}`)
  return fold(trimmed)
    .split(/\s+/)
    .every((word) => haystack.includes(word))
}

/**
 * Talks this browser opened before come first, then the sample talks; a sample
 * the reader already opened appears once, as recent, keeping its photo.
 */
export function buildSuggestions(
  query: string,
  recent: readonly RecentTalk[],
  featured: readonly FeaturedTalk[] = FEATURED_TALKS,
  limit = 8,
): TalkSuggestion[] {
  const images = new Map(featured.map((talk) => [talk.slug, talk.image]))
  const seen = new Set<string>()
  const all: TalkSuggestion[] = []

  for (const talk of recent) {
    if (seen.has(talk.slug)) continue
    seen.add(talk.slug)
    all.push({
      slug: talk.slug,
      title: talk.title,
      speaker: talk.speaker,
      // A sample's 16:9 photo first; otherwise the photo saved with the talk.
      image: images.get(talk.slug) ?? talk.image ?? null,
      kind: 'recent',
    })
  }
  for (const talk of featured) {
    if (seen.has(talk.slug)) continue
    seen.add(talk.slug)
    all.push({ slug: talk.slug, title: talk.title, speaker: talk.speaker, image: talk.image, kind: 'featured' })
  }

  return all.filter((suggestion) => matches(suggestion, query)).slice(0, limit)
}
