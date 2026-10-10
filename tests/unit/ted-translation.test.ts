import { describe, expect, it } from 'vitest'
import { extractTranslation, type TedPageProps } from '@/lib/ingest/ted'

/** Shapes mirror what TED returned when probed; the text is invented. */
function page(code: string | null, cues: { time: number; text: string }[] = []): TedPageProps {
  return {
    videoData: { duration: 60 },
    transcriptData: {
      translation:
        code === null
          ? null
          : {
              language: { internalLanguageCode: code, endonym: code === 'vi' ? 'Tiếng Việt' : 'English' },
              translator: { fullName: null, uri: '/profiles/111' },
              reviewer: { fullName: 'Người Duyệt', uri: '/profiles/222' },
              paragraphs: [{ cues }],
            },
    },
  }
}

describe('extractTranslation', () => {
  const viCues = [
    { time: 1000, text: 'Dòng một.' },
    { time: 4000, text: 'Dòng hai.' },
  ]

  it('returns the fragments when the page really is in the requested language', () => {
    const result = extractTranslation(page('vi', viCues), 'vi')

    expect(result?.label).toBe('Tiếng Việt')
    expect(result?.fragments).toEqual([
      { startMs: 1000, endMs: 4000, text: 'Dòng một.' },
      // Last fragment has no next start, so the talk duration closes it.
      { startMs: 4000, endMs: 60_000, text: 'Dòng hai.' },
    ])
  })

  /**
   * The failure this guards against: TED answers a request for a missing
   * language with the English page. Accepting it would print English under
   * English and call it a Vietnamese translation.
   */
  it('rejects a page that came back in English', () => {
    expect(extractTranslation(page('en', [{ time: 0, text: 'English line.' }]), 'vi')).toBeNull()
  })

  it('rejects a page with no translation object at all', () => {
    expect(extractTranslation(page(null), 'vi')).toBeNull()
  })

  it('rejects a translation that has no cues', () => {
    expect(extractTranslation(page('vi', []), 'vi')).toBeNull()
  })

  it('matches the language code case-insensitively', () => {
    expect(extractTranslation(page('vi', viCues), 'VI')).not.toBeNull()
  })

  it('credits by profile link and leaves an unknown name null instead of guessing', () => {
    const result = extractTranslation(page('vi', viCues), 'vi')

    expect(result?.credits).toEqual([
      { role: 'translator', name: null, url: 'https://www.ted.com/profiles/111' },
      { role: 'reviewer', name: 'Người Duyệt', url: 'https://www.ted.com/profiles/222' },
    ])
  })

  it('sorts fragments that arrive out of order', () => {
    const result = extractTranslation(
      page('vi', [
        { time: 5000, text: 'sau' },
        { time: 1000, text: 'trước' },
      ]),
      'vi',
    )
    expect(result?.fragments.map((fragment) => fragment.text)).toEqual(['trước', 'sau'])
  })
})
