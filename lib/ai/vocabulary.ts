import { buildVocabUserPrompt, VOCAB_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import {
  AI_MODEL,
  createStructuredGenerator,
  hasAnthropicKey,
  withOneRetry,
  type StructuredGenerator,
} from '@/lib/ai/structured'
import { assembleGroups, VocabWireSchema, type VocabWire } from '@/lib/ai/vocab-schema'
import { AppError, ERROR_CODES } from '@/lib/errors'
import type { VocabCandidate } from '@/lib/study/candidates'
import type { VocabSet } from '@/types/study'

export { hasAnthropicKey }

/**
 * Candidates per call. Every kept term now carries several senses with an
 * example each, so one call over all ~120 candidates risks running past the
 * output limit; smaller batches keep each answer comfortably inside it.
 */
export const VOCAB_BATCH_SIZE = 40

export interface VocabDeps {
  /** Injected in tests. Production builds one from ANTHROPIC_API_KEY. */
  generate?: StructuredGenerator
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Turns candidates into a graded vocabulary set with senses and examples.
 *
 * Costs money and takes seconds, so callers must check `hasAnthropicKey()` and
 * their own quota before getting here.
 */
export async function generateVocabSet(
  input: { title: string; author?: string; candidates: readonly VocabCandidate[] },
  deps: VocabDeps = {},
): Promise<VocabSet> {
  let generate = deps.generate
  if (!generate) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new AppError(ERROR_CODES.AI_UNAVAILABLE, 'ANTHROPIC_API_KEY is not configured')
    generate = createStructuredGenerator(apiKey)
  }
  if (input.candidates.length === 0) {
    throw new AppError(ERROR_CODES.NO_CAPTIONS, 'No candidate terms to build cards from')
  }

  const batches = chunk(input.candidates, VOCAB_BATCH_SIZE)
  const settled = await Promise.allSettled(
    batches.map((batch) =>
      withOneRetry(() =>
        generate({
          name: 'vocabulary_cards',
          schema: VocabWireSchema,
          system: VOCAB_SYSTEM_PROMPT,
          prompt: buildVocabUserPrompt({ ...input, candidates: batch }),
          effort: 'medium',
        }),
      ),
    ),
  )

  const wires: VocabWire[] = []
  const failures: unknown[] = []
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') wires.push(outcome.value)
    else failures.push(outcome.reason)
  }

  if (wires.length === 0) {
    throw new AppError(ERROR_CODES.AI_FAILED, 'The model did not return a usable vocabulary set', {
      cause: failures[0],
    })
  }
  if (failures.length > 0) {
    // A partial deck is still worth showing; say so in the log, not silently.
    console.warn(`[vocab] ${failures.length}/${batches.length} batches failed for "${input.title}"`)
  }

  // Candidates keep their global rank, so batching does not change who wins a group.
  const { groups, rejected } = assembleGroups(wires, input.candidates)
  if (Object.keys(rejected).length > 0) {
    console.warn(`[vocab] rejected model items for "${input.title}":`, rejected)
  }

  if (groups.every((group) => group.items.length === 0)) {
    throw new AppError(ERROR_CODES.AI_FAILED, 'The model returned no usable terms')
  }

  return { groups, model: AI_MODEL, hasMeanings: true }
}
