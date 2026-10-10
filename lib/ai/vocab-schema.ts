import { z } from 'zod'
import type { VocabCandidate } from '@/lib/study/candidates'
import {
  VOCAB_GROUP_KEYS,
  type VocabCard,
  type VocabGroup,
  type VocabGroupKey,
  type VocabSense,
} from '@/types/study'

/*
 * Two layers, on purpose.
 *
 * The WIRE schema is what the model is asked to emit. Structured outputs reject
 * or strip constraints such as minItems, minLength and minimum, and require
 * `additionalProperties: false` on every object — so the wire schema is strict
 * objects and bare types, nothing else.
 *
 * The real rules ("at least two common senses", "exactly one in-transcript
 * sense", "every sense has an example") live in `validateSenses`, in our code,
 * where they are enforced every time and covered by tests.
 */

export const SenseWireSchema = z.strictObject({
  meaningVi: z.string(),
  partOfSpeech: z.string(),
  isCommon: z.boolean(),
  inTranscript: z.boolean(),
  exampleEn: z.string(),
  exampleVi: z.string(),
})

export const ItemWireSchema = z.strictObject({
  term: z.string(),
  ipa: z.string(),
  singleCommonSense: z.boolean(),
  senses: z.array(SenseWireSchema),
})

export const VocabWireSchema = z.strictObject({
  common: z.array(ItemWireSchema),
  academic: z.array(ItemWireSchema),
  phrases: z.array(ItemWireSchema),
})

export type SenseWire = z.infer<typeof SenseWireSchema>
export type ItemWire = z.infer<typeof ItemWireSchema>
export type VocabWire = z.infer<typeof VocabWireSchema>

/** In-transcript sense plus up to three common ones. */
export const MAX_SENSES = 4
export const DEFAULT_MAX_PER_GROUP = 20

export type RejectReason =
  | 'unknown-term'
  | 'duplicate-term'
  | 'no-in-transcript-sense'
  | 'multiple-in-transcript-senses'
  | 'too-few-common-senses'

export type SenseCheck =
  | { ok: true; senses: VocabSense[]; singleCommonSense: boolean }
  | { ok: false; reason: RejectReason }

function toSense(wire: SenseWire): VocabSense | null {
  const meaningVi = wire.meaningVi.trim()
  const en = wire.exampleEn.trim()
  const vi = wire.exampleVi.trim()
  // "One example per sense" is a rule, not a nicety: a sense without one is dropped.
  if (!meaningVi || !en || !vi) return null
  return {
    meaningVi,
    partOfSpeech: wire.partOfSpeech.trim(),
    isCommon: wire.isCommon,
    inTranscript: wire.inTranscript,
    example: { en, vi },
  }
}

/**
 * Enforces the sense rules the learner asked for:
 * - exactly one sense is the one used in the talk, and it comes first;
 * - at least two common senses in total (the in-transcript sense counts if it
 *   is itself common, otherwise it is an extra on top);
 * - a term that genuinely has one common sense may say so via
 *   `singleCommonSense`, and then one common sense is enough — padding it with
 *   an invented meaning would teach something false.
 *
 * A sense that is neither common nor the in-transcript one has no reason to be
 * on the card and is dropped.
 */
export function validateSenses(item: ItemWire): SenseCheck {
  const senses = item.senses.map(toSense).filter((sense): sense is VocabSense => sense !== null)

  const inTranscript = senses.filter((sense) => sense.inTranscript)
  if (inTranscript.length === 0) return { ok: false, reason: 'no-in-transcript-sense' }
  if (inTranscript.length > 1) return { ok: false, reason: 'multiple-in-transcript-senses' }

  const primary = inTranscript[0]!
  const others = senses.filter((sense) => !sense.inTranscript && sense.isCommon)
  const ordered = [primary, ...others].slice(0, MAX_SENSES)

  const commonCount = ordered.filter((sense) => sense.isCommon).length
  const required = item.singleCommonSense ? 1 : 2
  if (commonCount < required) return { ok: false, reason: 'too-few-common-senses' }

  return { ok: true, senses: ordered, singleCommonSense: item.singleCommonSense }
}

export interface AssembleResult {
  groups: VocabGroup[]
  rejected: Partial<Record<RejectReason, number>>
}

/**
 * Turns one or more wire responses (one per candidate batch) into card groups.
 *
 * Card identity, the quoted line and its timestamp are joined in from our own
 * candidates. A term the model invented has nothing to join to and is dropped,
 * so a card can never quote a line the speaker did not say.
 *
 * A term claimed by an earlier group or batch keeps that first claim. Each
 * group keeps its best-ranked candidates, then shows them in the order they
 * were spoken.
 */
export function assembleGroups(
  wires: readonly VocabWire[],
  candidates: readonly VocabCandidate[],
  options?: { maxPerGroup?: number },
): AssembleResult {
  const maxPerGroup = options?.maxPerGroup ?? DEFAULT_MAX_PER_GROUP
  const byTerm = new Map(candidates.map((candidate, rank) => [candidate.term.toLowerCase(), { candidate, rank }]))
  const claimed = new Set<string>()
  const rejected: Partial<Record<RejectReason, number>> = {}
  const reject = (reason: RejectReason) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1
  }

  const collected = new Map<VocabGroupKey, { card: VocabCard; rank: number }[]>(
    VOCAB_GROUP_KEYS.map((key) => [key, []]),
  )

  for (const wire of wires) {
    for (const key of VOCAB_GROUP_KEYS) {
      for (const item of wire[key]) {
        const lookup = item.term.trim().toLowerCase()
        const match = byTerm.get(lookup)
        if (!match) {
          reject('unknown-term')
          continue
        }
        if (claimed.has(lookup)) {
          reject('duplicate-term')
          continue
        }

        const check = validateSenses(item)
        if (!check.ok) {
          reject(check.reason)
          continue
        }

        claimed.add(lookup)
        const { candidate } = match
        const primary = check.senses[0]!
        collected.get(key)!.push({
          rank: match.rank,
          card: {
            term: candidate.term,
            display: candidate.display,
            ipa: candidate.kind === 'phrase' ? '' : item.ipa.trim(),
            partOfSpeech: primary.partOfSpeech,
            meaningVi: primary.meaningVi,
            senses: check.senses,
            singleCommonSense: check.singleCommonSense,
            context: candidate.context,
            contextMatch: candidate.contextMatch,
            cueIdx: candidate.cueIdx,
            startMs: candidate.startMs,
          },
        })
      }
    }
  }

  const groups = VOCAB_GROUP_KEYS.map((key) => ({
    key,
    items: collected
      .get(key)!
      .sort((a, b) => a.rank - b.rank)
      .slice(0, maxPerGroup)
      .map((entry) => entry.card)
      .sort((a, b) => a.startMs - b.startMs),
  }))

  return { groups, rejected }
}
