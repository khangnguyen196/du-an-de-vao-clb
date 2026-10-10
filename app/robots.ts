import type { MetadataRoute } from 'next'
import { NOINDEX_PATHS, siteUrl } from '@/lib/site'

/**
 * Talk pages and the landing page are meant to be found. The word book and the
 * review queue live in each visitor's browser — a crawler would only see an
 * empty shell. Vocabulary pages repeat the talk page's words and add nothing
 * for search, and every one of them costs a transcript fetch.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...NOINDEX_PATHS, '/watch/ted/*/vocab'],
      },
    ],
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  }
}
