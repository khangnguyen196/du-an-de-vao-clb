import { describe, expect, it } from 'vitest'
import { isTedImageUrl } from '@/lib/ted-images'

describe('isTedImageUrl', () => {
  it('accepts TED photo paths old and new', () => {
    expect(isTedImageUrl('https://pi.tedcdn.com/r/talkstar-photos.s3.amazonaws.com/uploads/a/b-embed.jpg')).toBe(true)
    expect(isTedImageUrl('https://pi.tedcdn.com/r/talkstar-assets.s3.amazonaws.com/production/talks/t/b-1350x675.jpg')).toBe(true)
    expect(isTedImageUrl('https://pe.tedcdn.com/images/ted/abc_2880x1620.jpg')).toBe(true)
  })

  it('refuses anything next/image is not configured for', () => {
    expect(isTedImageUrl('http://pi.tedcdn.com/r/x.jpg')).toBe(false)
    expect(isTedImageUrl('https://pi.tedcdn.com/other/x.jpg')).toBe(false)
    expect(isTedImageUrl('https://evil.example/r/x.jpg')).toBe(false)
    expect(isTedImageUrl('not a url')).toBe(false)
  })
})
