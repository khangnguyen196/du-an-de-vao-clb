import { describe, expect, it } from 'vitest'
import { resolveSource } from '@/lib/ingest/resolve'
import { parseTedSlug } from '@/lib/ingest/ted'
import { isYouTubeLink, parseYouTubeVideoId } from '@/lib/ingest/youtube-url'

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

describe('parseYouTubeVideoId', () => {
  it.each([
    'https://www.youtube.com/watch?v=iCvmsMzlF7o',
    'https://www.youtube.com/watch?v=iCvmsMzlF7o&t=42s',
    'https://www.youtube.com/watch?feature=share&v=iCvmsMzlF7o',
    'https://youtu.be/iCvmsMzlF7o',
    'https://youtu.be/iCvmsMzlF7o?si=abc',
    'https://m.youtube.com/watch?v=iCvmsMzlF7o',
    'https://www.youtube.com/shorts/iCvmsMzlF7o',
    'https://www.youtube.com/embed/iCvmsMzlF7o',
    'https://www.youtube.com/live/iCvmsMzlF7o',
    'https://www.youtube-nocookie.com/embed/iCvmsMzlF7o',
    'youtube.com/watch?v=iCvmsMzlF7o',
    'iCvmsMzlF7o',
  ])('reads the id from %s', (input) => {
    expect(parseYouTubeVideoId(input)).toBe('iCvmsMzlF7o')
  })

  it.each([
    '',
    'https://www.youtube.com/',
    'https://www.youtube.com/@TED',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/watch?v=short',
    'https://vimeo.com/123456',
    // An 11-letter lowercase word is a title search, not an id.
    'procrastina',
  ])('finds no video in %s', (input) => {
    expect(parseYouTubeVideoId(input)).toBeNull()
  })
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

  it('sends a YouTube video to the lookup page that finds it on ted.com', () => {
    expect(resolveSource('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      status: 'ok',
      kind: 'youtube',
      id: 'dQw4w9WgXcQ',
      href: '/watch/youtube/dQw4w9WgXcQ',
    })
  })

  it('flags a YouTube link that names no video separately so the user gets the real reason', () => {
    expect(resolveSource('https://www.youtube.com/@TED')).toEqual({ status: 'youtube-blocked' })
    expect(resolveSource('https://www.youtube.com/playlist?list=PL123')).toEqual({ status: 'youtube-blocked' })
  })

  it('returns unknown for anything else', () => {
    expect(resolveSource('https://vimeo.com/123')).toEqual({ status: 'unknown' })
    expect(resolveSource('gibberish')).toEqual({ status: 'unknown' })
  })

  it('prefers TED when a link could look like both', () => {
    expect(resolveSource('https://www.ted.com/talks/some_talk').status).toBe('ok')
  })
})
