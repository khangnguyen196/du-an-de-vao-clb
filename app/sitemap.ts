import type { MetadataRoute } from 'next'
import { FEATURED_TALKS } from '@/lib/featured-talks'
import { siteUrl } from '@/lib/site'

/**
 * The landing page and the hand-picked sample talks. Deliberately not the
 * whole TED catalogue: listing thousands of talks would invite crawlers to make
 * this server fetch each one from TED, which is exactly the load the abuse
 * limits exist to prevent.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  return [
    { url: new URL('/', base).toString(), changeFrequency: 'weekly', priority: 1 },
    ...FEATURED_TALKS.map((talk) => ({
      url: new URL(`/watch/ted/${talk.slug}`, base).toString(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
