import { describe, expect, it } from 'vitest'
import { resolveSource } from '@/lib/ingest/resolve'
import { parseTedSlug } from '@/lib/ingest/ted'
import { isYouTubeLink } from '@/lib/ingest/youtube-url'

describe('parseTedSlug', () => {
  it.each([
    [
      'https://www.ted.com/talks/brene_brown_the_power_of_vulnerability',
      'brene_brown_the_power_of_vulnerability',
    ],
    [
      'https://www.ted.com/talks/brene_brown_the_power_of_vulnerability/transcript',
      'brene_brown_the_power_of_vulnerability',
    ],
    ['https://www.ted.com/talks/some_talk?language=vi', 'some_talk'],
    ['https://ted.com/talks/some_talk', 'some_talk'],
    ['ted.com/talks/some_talk', 'some_talk'],
    ['  https://www.ted.com/talks/some_talk  ', 'some_talk'],
    ['some_talk', 'some_talk'],
  ])('accepts %s', (input, expected) => {
    expect(parseTedSlug(input)).toBe(expected)
  })

  it.each([
    '',
    'not a url',
    'https://www.ted.com/',
    'https://www.ted.com/playlists/123',
    'https://notted.com/talks/some_talk',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  ])('rejects %s', (input) => {
    expect(parseTedSlug(input)).toBeNull()
  })
})

describe('isYouTubeLink', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
  ])('detects %s', (input) => {
    expect(isYouTubeLink(input)).toBe(true)
  })

  it.each(['', 'https://vimeo.com/123456', 'https://www.ted.com/talks/some_talk'])(
    'ignores %s',
    (input) => {
      expect(isYouTubeLink(input)).toBe(false)
    },
  )
})

describe('resolveSource', () => {
  it('routes a TED link to the talk page', () => {
    expect(resolveSource('https://www.ted.com/talks/some_talk')).toEqual({
      status: 'ok',
      kind: 'ted',
      id: 'some_talk',
      href: '/watch/ted/some_talk',
    })
  })

  it('flags a YouTube link separately so the user gets the real reason', () => {
    expect(resolveSource('https://youtu.be/dQw4w9WgXcQ')).toEqual({ status: 'youtube-blocked' })
  })

  it('returns unknown for anything else', () => {
    expect(resolveSource('https://vimeo.com/123')).toEqual({ status: 'unknown' })
    expect(resolveSource('gibberish')).toEqual({ status: 'unknown' })
  })

  it('prefers TED when a link could look like both', () => {
    expect(resolveSource('https://www.ted.com/talks/some_talk').status).toBe('ok')
  })
})
