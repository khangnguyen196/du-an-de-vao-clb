import { buildTranslationUserPrompt, TRANSLATION_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import {
  createStructuredGenerator,
  withOneRetry,
  type StructuredGenerator,
} from '@/lib/ai/structured'
import {
  buildTranslationBatches,
  mergeTranslations,
  TranslationWireSchema,
  type TranslationWire,
} from '@/lib/ai/translate-core'
import { AppError, ERROR_CODES } from '@/lib/errors'
import type { Cue, TranscriptTranslation } from '@/types/transcript'

/** Parallel calls per talk — enough to finish quickly, few enough not to trip rate limits. */
export const TRANSLATION_CONCURRENCY = 3

export interface TranslateDeps {
  generate?: StructuredGenerator
}

async function mapWithLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

/** One entry per cue, in cue order, plus the label the UI shows above them. */
export interface TranslationResult {
  texts: (string | null)[]
  translation: TranscriptTranslation
}

/**
 * Machine translation for talks TED has no Vietnamese translation for.
 *
 * Each batch is independent: a failed batch leaves its lines untranslated
 * instead of guessed, and the coverage figure reports the gap. Returns null
 * when nothing at all came back, so the page shows "no translation" rather
 * than an empty machine translation.
 *
 * Returns the translated lines rather than rebuilt cues. The caller already
 * holds the cues, and this result crosses the server/browser boundary once the
 * page no longer waits for it — sending the whole transcript back a second time
 * to carry a column of Vietnamese would double the payload for nothing. Use
 * `applyTranslations` to put them together.
 */
export async function translateCues(
  input: { cues: readonly Cue[]; title: string; author?: string },
  deps: TranslateDeps = {},
): Promise<TranslationResult | null> {
  let generate = deps.generate
  if (!generate) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AppError(ERROR_CODES.AI_UNAVAILABLE, 'ANTHROPIC_API_KEY is not configured')
    generate = createStructuredGenerator(apiKey)
  }

  const batches = buildTranslationBatches(input.cues)
  const meta = { title: input.title, ...(input.author ? { author: input.author } : {}) }

  /*
   * Kept so a talk that translated nothing at all can report WHY. Every batch
   * failing usually means one cause for all of them — no credit, a rejected key
   * — and the caller can only tell the reader which it was if the error
   * survives. A partial failure stays swallowed: those lines are simply left
   * untranslated and counted in `coverage`.
   */
  let firstError: unknown = null

  const outputs = await mapWithLimit(batches, TRANSLATION_CONCURRENCY, async (batch): Promise<TranslationWire | null> => {
    try {
      return await withOneRetry(() =>
        generate({
          name: 'transcript_translation',
          schema: TranslationWireSchema,
          system: TRANSLATION_SYSTEM_PROMPT,
          prompt: buildTranslationUserPrompt(batch, meta),
          effort: 'medium',
          maxOutputTokens: 8_000,
        }),
      )
    } catch (error) {
      firstError ??= error
      const first = batch.lines[0]?.index ?? 0
      console.warn(`[translate] "${input.title}" lines ${first}+ failed:`, (error as Error).message)
      return null
    }
  })

  const merged = mergeTranslations(input.cues, batches, outputs)
  if (merged.coverage === 0) {
    if (firstError) throw firstError
    return null
  }

  return {
    texts: merged.texts,
    translation: {
      lang: 'vi',
      label: 'Tiếng Việt',
      origin: 'model',
      credits: [],
      coverage: merged.coverage,
    },
  }
}
