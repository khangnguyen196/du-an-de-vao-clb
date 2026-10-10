import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  // Translations written by the translator agent and Whisper transcripts are
  // read from disk at request time (`lib/ingest/translation-store.ts`,
  // `transcript-store.ts`); file tracing cannot see a path built at runtime, so
  // ship the folders with the routes that read them. Keys match as "contains",
  // so the talk key also covers its vocab page and share image.
  outputFileTracingIncludes: {
    '/watch/ted/[slug]': ['./data/translations/**/*', './data/transcripts/**/*'],
    '/api/transcript': ['./data/translations/**/*', './data/transcripts/**/*'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      // TED's talk photos for the sample-talk thumbnails (lib/featured-talks.ts).
      // The originals are 2880×1620 and up to 1.8 MB; next/image serves them
      // resized to the card.
      { protocol: 'https', hostname: 'pi.tedcdn.com', pathname: '/r/talkstar-photos.s3.amazonaws.com/uploads/**' },
      { protocol: 'https', hostname: 'pe.tedcdn.com', pathname: '/images/ted/**' },
    ],
  },
}

export default withNextIntl(nextConfig)
