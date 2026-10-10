/**
 * The public origin, for absolute URLs in metadata, the sitemap and robots.txt.
 *
 * NEXT_PUBLIC_SITE_URL wins when set (a custom domain later). On Vercel,
 * VERCEL_PROJECT_PRODUCTION_URL is the production domain without a scheme and
 * is set for every deployment, previews included — so a preview never claims
 * its own throwaway URL as canonical. Locally it is the dev server.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return new URL(explicit)

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (production) return new URL(`https://${production}`)

  return new URL('http://localhost:3000')
}

/** Paths that are personal, empty to a crawler, or not pages at all. */
export const NOINDEX_PATHS = ['/words', '/review', '/api/'] as const
