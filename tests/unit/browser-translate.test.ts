import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkBrowserTranslation,
  coverageOf,
  getBrowserTranslatorFactory,
  MAX_CONSECUTIVE_FAILURES,
  PROGRESS_EVERY,
  toTranslatorLanguage,
  translateLines,
  type BrowserTranslator,
  type BrowserTranslatorFactory,
} from '@/lib/ai/browser-translate'

function fakeTranslator(fn: (text: string) => string | Promise<string>): BrowserTranslator {
  return { translate: vi.fn(async (text: string) => fn(text)) }
}

const lines = Array.from({ length: 25 }, (_, i) => `Line ${String(i)}.`)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('translateLines', () => {
  it('keeps every translation on the line it came from', async () => {
    const texts = await translateLines(lines, { translator: fakeTranslator((text) => `VI ${text}`) })
    expect(texts).toEqual(lines.map((line) => `VI ${line}`))
  })

  it('leaves a failed or empty line untranslated instead of guessing', async () => {
    const translator = fakeTranslator((text) => {
      if (text === 'Line 3.') throw new Error('model hiccup')
      if (text === 'Line 4.') return '   '
      return `VI ${text}`
    })
    const texts = await translateLines(lines, { translator })

    expect(texts[2]).toBe('VI Line 2.')
    expect(texts[3]).toBeNull()
    expect(texts[4]).toBeNull()
    expect(texts[5]).toBe('VI Line 5.')
  })

  it('stops asking a translator that keeps failing', async () => {
    const translator = fakeTranslator(() => {
      throw new Error('model gone')
    })
    const texts = await translateLines(lines, { translator })

    expect(translator.translate).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES)
    expect(texts.every((text) => text === null)).toBe(true)
    expect(texts).toHaveLength(lines.length)
  })

  it('reports progress in steps and once at the end, as snapshots', async () => {
    const reports: { done: number; filled: number }[] = []
    await translateLines(lines, {
      translator: fakeTranslator((text) => `VI ${text}`),
      onProgress: (texts, done) => reports.push({ done, filled: texts.filter(Boolean).length }),
    })

    expect(reports).toEqual([
      { done: PROGRESS_EVERY, filled: PROGRESS_EVERY },
      { done: PROGRESS_EVERY * 2, filled: PROGRESS_EVERY * 2 },
      { done: lines.length, filled: lines.length },
    ])
  })

  it('rejects when aborted and translates nothing further', async () => {
    const controller = new AbortController()
    const translator = fakeTranslator((text) => {
      if (text === 'Line 2.') controller.abort()
      return `VI ${text}`
    })

    await expect(translateLines(lines, { translator, signal: controller.signal })).rejects.toThrow()
    expect(translator.translate).toHaveBeenCalledTimes(3)
  })
})

describe('checkBrowserTranslation', () => {
  it('asks for a bare subtag pair into Vietnamese', async () => {
    const availability = vi.fn(async () => 'available' as const)
    const factory = { availability, create: vi.fn() } as unknown as BrowserTranslatorFactory

    await expect(checkBrowserTranslation(factory, 'en-GB')).resolves.toBe('available')
    expect(availability).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'vi' })
  })

  it('treats a throwing API as unavailable', async () => {
    const factory = {
      availability: vi.fn(async () => {
        throw new Error('not implemented')
      }),
      create: vi.fn(),
    } as unknown as BrowserTranslatorFactory

    await expect(checkBrowserTranslation(factory, 'en')).resolves.toBe('unavailable')
  })

  it('gives up on an API that never answers', async () => {
    const factory = {
      availability: vi.fn(() => new Promise<never>(() => {})),
      create: vi.fn(),
    } as unknown as BrowserTranslatorFactory

    await expect(checkBrowserTranslation(factory, 'en', 20)).resolves.toBe('unavailable')
  })
})

describe('getBrowserTranslatorFactory', () => {
  it('is null where the browser has no Translator API', () => {
    expect(getBrowserTranslatorFactory()).toBeNull()
  })

  it('is null for a global that does not look like the API', () => {
    vi.stubGlobal('Translator', { availability: () => 'available' })
    expect(getBrowserTranslatorFactory()).toBeNull()
  })

  it('returns the global when it has availability and create', () => {
    const api = { availability: vi.fn(), create: vi.fn() }
    vi.stubGlobal('Translator', api)
    expect(getBrowserTranslatorFactory()).toBe(api)
  })
})

describe('helpers', () => {
  it('reduces regional tags to the language', () => {
    expect(toTranslatorLanguage('en')).toBe('en')
    expect(toTranslatorLanguage('pt-BR')).toBe('pt')
    expect(toTranslatorLanguage('zh_TW')).toBe('zh')
  })

  it('measures coverage over all lines', () => {
    expect(coverageOf(['a', null, 'b', null])).toBe(0.5)
    expect(coverageOf([])).toBe(0)
  })
})
