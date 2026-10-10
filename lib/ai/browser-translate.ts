/**
 * Last-resort machine translation that runs on the reader's own device, through
 * the Translator API built into Chrome. Free and keyless, so it is what keeps a
 * talk bilingual when the server has nothing to offer — no Anthropic key, no
 * credit left. Every other browser simply lacks the API and the page stays
 * English-only, as it would have without this.
 *
 * Kept free of React and of the global so the logic can be tested with a fake
 * translator; `use-browser-translation.ts` wires it to the page.
 */

import type { TranscriptTranslation } from '@/types/transcript'

export type BrowserTranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface LanguagePair {
  sourceLanguage: string
  targetLanguage: string
}

export interface BrowserTranslator {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>
  destroy?(): void
}

interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void
}

/** The slice of Chrome's `Translator` global this module relies on. */
export interface BrowserTranslatorFactory {
  availability(pair: LanguagePair): Promise<BrowserTranslatorAvailability>
  create(
    options: LanguagePair & { signal?: AbortSignal; monitor?: (monitor: DownloadMonitor) => void },
  ): Promise<BrowserTranslator>
}

export const BROWSER_TARGET_LANG = 'vi'

/**
 * A translator that keeps failing has usually lost its model, not stumbled on
 * one hard sentence. Stop asking rather than spend a minute collecting errors.
 */
export const MAX_CONSECUTIVE_FAILURES = 5

/** Lines per progress report — often enough to watch it fill in, rare enough not to re-render per line. */
export const PROGRESS_EVERY = 10

export function getBrowserTranslatorFactory(): BrowserTranslatorFactory | null {
  const candidate = (globalThis as { Translator?: unknown }).Translator
  if (typeof candidate !== 'function' && (typeof candidate !== 'object' || candidate === null)) return null

  const factory = candidate as Partial<BrowserTranslatorFactory>
  return typeof factory.availability === 'function' && typeof factory.create === 'function'
    ? (factory as BrowserTranslatorFactory)
    : null
}

/** The API takes a bare language subtag; TED reports regional tags such as "en-GB". */
export function toTranslatorLanguage(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0] ?? lang
}

export function languagePair(sourceLang: string): LanguagePair {
  return { sourceLanguage: toTranslatorLanguage(sourceLang), targetLanguage: BROWSER_TARGET_LANG }
}

/**
 * Chromium builds that expose `Translator` without the on-device backend (seen
 * in an embedded Chromium 152) never settle `availability()` at all. Real
 * Chrome answers in milliseconds, so waiting longer than this only means the
 * page sits on a question with no answer coming.
 */
export const AVAILABILITY_TIMEOUT_MS = 5_000

/** Never rejects and always settles: a broken, hung or half-shipped API is just "unavailable". */
export async function checkBrowserTranslation(
  factory: BrowserTranslatorFactory,
  sourceLang: string,
  timeoutMs = AVAILABILITY_TIMEOUT_MS,
): Promise<BrowserTranslatorAvailability> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'unavailable'>((resolve) => {
    timer = setTimeout(() => resolve('unavailable'), timeoutMs)
  })

  try {
    return await Promise.race([factory.availability(languagePair(sourceLang)), timeout])
  } catch {
    return 'unavailable'
  } finally {
    clearTimeout(timer)
  }
}

export interface TranslateLinesOptions {
  translator: BrowserTranslator
  signal?: AbortSignal
  /** Receives a snapshot after every `PROGRESS_EVERY` lines and once at the end. */
  onProgress?: (texts: readonly (string | null)[], done: number) => void
}

/**
 * Translates line by line, in order, one line per call.
 *
 * One call per cue keeps every Vietnamese line under its own English line —
 * sending paragraphs would mean splitting the answer back up by guesswork.
 * Cues are already merged into whole sentences, so a line rarely lacks the
 * context it needs. A line that fails or comes back empty stays `null`: left
 * untranslated, never filled with a guess, and counted against coverage.
 *
 * Rejects only when aborted.
 */
export async function translateLines(
  lines: readonly string[],
  { translator, signal, onProgress }: TranslateLinesOptions,
): Promise<(string | null)[]> {
  const texts: (string | null)[] = lines.map(() => null)
  let failures = 0

  for (let index = 0; index < lines.length; index += 1) {
    signal?.throwIfAborted()

    try {
      const result = (await translator.translate(lines[index]!, signal ? { signal } : undefined)).trim()
      texts[index] = result || null
      failures = 0
    } catch (error) {
      signal?.throwIfAborted()
      failures += 1
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(`[browser-translate] giving up after ${String(failures)} failures in a row:`, (error as Error).message)
        break
      }
    }

    const done = index + 1
    if (done % PROGRESS_EVERY === 0 && done < lines.length) onProgress?.(texts.slice(), done)
  }

  onProgress?.(texts.slice(), lines.length)
  return texts
}

export function coverageOf(texts: readonly (string | null)[]): number {
  if (texts.length === 0) return 0
  return texts.filter((text) => text !== null).length / texts.length
}

/** Same shape the server's machine translation carries; the page tells the two apart by where it came from. */
export function browserTranscriptTranslation(coverage: number): TranscriptTranslation {
  return { lang: BROWSER_TARGET_LANG, label: 'Tiếng Việt', origin: 'model', credits: [], coverage }
}
