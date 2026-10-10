import { cache } from 'react'
import { describeErrorCause, hasAnthropicKey, isAuthError, isBillingError } from '@/lib/ai/structured'
import { translateCues } from '@/lib/ai/translate'
import { applyTranslations } from '@/lib/ai/translate-core'
import { fetchTedTranscript } from '@/lib/ingest/ted'
import { readStoredTranscript } from '@/lib/ingest/transcript-store'
import { readStoredTranslation } from '@/lib/ingest/translation-store'
import type { Transcript, TranscriptTranslation } from '@/types/transcript'

const TTL_MS = 30 * 60 * 1000

/**
 * A failure is remembered too, so a dead key does not start a fresh round of
 * model calls on every page view. Far shorter than a success: the usual fix is
 * topping up credit or replacing the key, and waiting half an hour to find out
 * it worked would be its own bug.
 */
const FAILURE_TTL_MS = 60 * 1000

/**
 * A page holds its streaming response open until this settles, so it must
 * always settle. The AI SDK bounds each individual call but not the whole run.
 */
const TRANSLATION_TIMEOUT_MS = 120 * 1000

/** Why no machine translation came back. Mirrors `VocabAiIssue`. */
export type TranslationIssue = 'auth' | 'billing' | 'failed'

/** A machine translation, resolved after the page was already sent. */
export interface DeferredTranslation {
  /** One entry per cue, in cue order; `null` where nothing came back. */
  texts: (string | null)[]
  translation: TranscriptTranslation
}

/**
 * Stopgap cache until the `transcripts`/`cues` tables land in M2.
 *
 * It lives in process memory, so it does nothing across serverless instances
 * and is wiped on every deploy. It is here for one reason: refetching the same
 * talk on each page view is slow and gets the server rate-limited faster.
 * Replace with the DB cache keyed on (external_id, lang) — do not build on it.
 *
 * It matters more now: a machine translation is paid for per talk, and this
 * memory cache is the only thing standing between repeat views and repeat bills.
 */
const transcripts = new Map<string, { transcript: Transcript; storedAt: number }>()
const translations = new Map<string, { value: DeferredTranslation | null; storedAt: number }>()

/**
 * Runs in progress, so two readers opening the same talk at the same moment
 * pay for one translation rather than two. Entries are removed as they settle;
 * the result then lives in `translations`.
 */
const inFlight = new Map<string, Promise<DeferredTranslation | null>>()

function cacheKey(slug: string, lang?: string): string {
  return `ted:${slug}:${lang ?? 'auto'}`
}

function readTranscript(key: string): Transcript | null {
  const hit = transcripts.get(key)
  if (!hit) return null

  // A transcript whose translation failed to load is retried soon, not in half an hour.
  const ttl = hit.transcript.translationFetchFailed ? FAILURE_TTL_MS : TTL_MS
  if (Date.now() - hit.storedAt > ttl) {
    transcripts.delete(key)
    return null
  }
  return hit.transcript
}

function readTranslation(key: string): { value: DeferredTranslation | null } | null {
  const hit = translations.get(key)
  if (!hit) return null

  if (Date.now() - hit.storedAt > (hit.value ? TTL_MS : FAILURE_TTL_MS)) {
    translations.delete(key)
    return null
  }
  return hit
}

/**
 * A talk needs a machine translation only when the platform has no human one.
 *
 * Matched on the `vi` prefix rather than by equality: TED reports plain "vi",
 * but a regional tag such as "vi-VN" is still Vietnamese, and paying a model to
 * translate Vietnamese into Vietnamese is the kind of bug that only shows up on
 * the invoice.
 */
export function needsMachineTranslation(transcript: Transcript): boolean {
  if (transcript.translation) return false
  if (transcript.lang.toLowerCase().startsWith('vi')) return false
  return transcript.cues.length > 0
}

/** Never rejects: the caller is a page that must render either way. */
async function runTranslation(transcript: Transcript): Promise<DeferredTranslation | null> {
  try {
    return await translateCues({
      cues: transcript.cues,
      title: transcript.source.title,
      ...(transcript.source.author ? { author: transcript.source.author } : {}),
    })
  } catch (error) {
    const issue: TranslationIssue = isAuthError(error) ? 'auth' : isBillingError(error) ? 'billing' : 'failed'
    const cause = describeErrorCause(error)
    // No credit is an account state, not a fault; the browser fallback takes
    // over. A rejected key or a broken answer still logs as error.
    const log = issue === 'billing' ? console.warn : console.error
    log(
      `[translate] machine translation unavailable for "${transcript.source.title}" (${issue}):`,
      (error as Error).message,
      ...(cause ? [`— cause: ${cause}`] : []),
    )
    return null
  }
}

function withTimeout(
  work: Promise<DeferredTranslation | null>,
  ms: number,
  onTimeout: () => void,
): Promise<DeferredTranslation | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      onTimeout()
      resolve(null)
    }, ms)

    void work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}

/**
 * Starts (or joins) the machine translation for a talk without waiting for it.
 *
 * Returns `null` — not a resolved promise — when there is nothing to translate
 * or no way to get one (no stored file, no key), so the caller can tell "never
 * going to happen" from "on its way" and show the right thing. The promise itself never rejects.
 *
 * Deliberately not awaited by the page: the transcript is already in hand, and
 * making the reader watch a blank screen while forty model calls finish is a
 * worse page than one that fills the Vietnamese in as it arrives.
 */
export function getMachineTranslation(
  slug: string,
  lang: string | undefined,
  transcript: Transcript,
  options: {
    /**
     * Asked only right before a NEW model run would start — never for a stored
     * file, a cached result or a run already in flight, which cost nothing more.
     * Returning false skips the model; the page falls back like with no key.
     */
    allowModel?: () => boolean
  } = {},
): Promise<DeferredTranslation | null> | null {
  if (!needsMachineTranslation(transcript)) return null

  // A translation the `translator` subagent already wrote costs nothing and
  // needs no key, so it is checked first — and on every view, so a file saved
  // while the server runs shows up without waiting out a cached failure.
  const stored = readStoredTranslation(slug, transcript.lang, transcript.cues)
  if (stored) return Promise.resolve(stored)

  if (!hasAnthropicKey()) return null

  const key = cacheKey(slug, lang)

  const cached = readTranslation(key)
  if (cached) return cached.value ? Promise.resolve(cached.value) : null

  const running = inFlight.get(key)
  if (running) return running

  if (options.allowModel && !options.allowModel()) return null

  const started = withTimeout(runTranslation(transcript), TRANSLATION_TIMEOUT_MS, () => {
    console.error(
      `[translate] machine translation timed out after ${String(TRANSLATION_TIMEOUT_MS)}ms for "${transcript.source.title}"`,
    )
  }).then((value) => {
    translations.set(key, { value, storedAt: Date.now() })
    inFlight.delete(key)
    return value
  })

  inFlight.set(key, started)
  return started
}

/**
 * `cache` dedupes calls inside a single render pass (the page body and
 * generateMetadata both want the transcript); the Map spans requests.
 *
 * Returns the transcript as the platform gave it — no model call, nothing paid
 * for, nothing to wait on. A machine translation is started separately by
 * whoever wants one; see `getMachineTranslation`.
 */
export const getTranscript = cache(async (slug: string, lang?: string): Promise<Transcript> => {
  const key = cacheKey(slug, lang)

  const cached = readTranscript(key)
  if (cached) return cached

  const transcript = await fetchTedTranscript(slug, {
    ...(lang ? { lang } : {}),
    storedTranscript: (video) => readStoredTranscript(video),
  })
  transcripts.set(key, { transcript, storedAt: Date.now() })
  return transcript
})

/**
 * The whole transcript with the machine translation already merged in.
 *
 * For callers that hand over a finished document and have no second chance to
 * fill it in later — the JSON endpoint, exports, scripts. Pages should not use
 * this: it reintroduces exactly the wait that streaming the translation removed.
 */
export async function getTranslatedTranscript(slug: string, lang?: string): Promise<Transcript> {
  const transcript = await getTranscript(slug, lang)
  const machine = await getMachineTranslation(slug, lang, transcript)
  if (!machine) return transcript

  return {
    ...transcript,
    cues: applyTranslations(transcript.cues, machine.texts),
    translation: machine.translation,
  }
}
