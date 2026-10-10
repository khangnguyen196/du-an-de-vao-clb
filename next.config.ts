import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  // Translations written by the translator agent are read from disk at request
  // time (`lib/ingest/translation-store.ts`); file tracing cannot see a path
  // built at runtime, so ship the folder with the routes that read it.
  outputFileTracingIncludes: {
    '/watch/ted/[slug]': ['./data/translations/**/*'],
    '/api/transcript': ['./data/translations/**/*'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
  },
}

export default withNextIntl(nextConfig)
