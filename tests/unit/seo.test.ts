import { NextIntlClientProvider } from 'next-intl'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { TranscriptPane } from '@/components/transcript/TranscriptPane'
import { FEATURED_TALKS } from '@/lib/featured-talks'
import { parseTedSlug } from '@/lib/ingest/ted'
import { siteUrl } from '@/lib/site'
import messages from '@/messages/vi.json'
import type { Cue } from '@/types/transcript'

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Invented lines — not from any talk. */
const cues: Cue[] = Array.from({ length: 40 }, (_, idx) => ({
  idx,
  startMs: idx * 4000,
  endMs: idx * 4000 + 4000,
  text: `Invented line number ${String(idx)}.`,
  translation: `Dòng bịa số ${String(idx)}.`,
}))

function serverHtml(props: Partial<Parameters<typeof TranscriptPane>[0]> = {}): string {
  return renderToStaticMarkup(
    // Same as flip-card.test.ts: the provider's props type requires `children`.
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, {
      locale: 'vi',
      messages,
      timeZone: 'Asia/Ho_Chi_Minh',
      children: createElement(TranscriptPane, {
        cues,
        query: '',
        matches: [],
        focusedMatch: -1,
        showTranslation: true,
        translationLang: 'vi',
        ...props,
      }),
    }),
  )
}

describe('transcript in the server HTML', () => {
  /** The bug this guards: the virtual list drew zero rows on the server, so crawlers saw no transcript. */
  it('contains every line, not just the first screenful', () => {
    const html = serverHtml()
    expect(html).toContain('Invented line number 0.')
    expect(html).toContain('Invented line number 39.')
  })

  it('shows a TED translation as ordinary text', () => {
    expect(serverHtml()).not.toContain('data-nosnippet')
  })

  it('marks a machine translation so search engines do not quote it', () => {
    const html = serverHtml({ translationIsMachine: true })
    expect(html).toContain('data-nosnippet')
    expect(html).toContain('Dòng bịa số 39.')
  })
})

describe('siteUrl', () => {
  it('prefers an explicit site URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.org')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ww.vercel.app')
    expect(siteUrl().origin).toBe('https://example.org')
  })

  it('uses the Vercel production domain, so previews never claim their own URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ww-nu-lyart.vercel.app')
    expect(siteUrl().origin).toBe('https://ww-nu-lyart.vercel.app')
  })
})

describe('robots and sitemap', () => {
  it('keeps crawlers off personal pages, vocabulary pages and the API', () => {
    const rules = robots().rules
    const disallow = (Array.isArray(rules) ? rules[0] : rules)?.disallow
    expect(disallow).toEqual(expect.arrayContaining(['/words', '/review', '/api/', '/watch/ted/*/vocab']))
  })

  it('lists the home page and every sample talk, all on the site origin', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ww-nu-lyart.vercel.app')
    const urls = sitemap().map((entry) => entry.url)
    expect(urls[0]).toBe('https://ww-nu-lyart.vercel.app/')
    expect(urls).toHaveLength(FEATURED_TALKS.length + 1)
    expect(urls.every((url) => url.startsWith('https://ww-nu-lyart.vercel.app/'))).toBe(true)
  })

  it('only features slugs the app accepts', () => {
    for (const talk of FEATURED_TALKS) expect(parseTedSlug(talk.slug)).toBe(talk.slug)
  })
})
