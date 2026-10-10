import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  assembleGroups,
  MAX_SENSES,
  validateSenses,
  VocabWireSchema,
  type ItemWire,
  type SenseWire,
  type VocabWire,
} from '@/lib/ai/vocab-schema'
import type { VocabCandidate } from '@/lib/study/candidates'

/** Invented fixtures — not model output, not quotes from any talk. */
const candidate = (term: string, rank: number, kind: 'word' | 'phrase' = 'word'): VocabCandidate => ({
  term,
  display: term,
  kind,
  count: 1,
  cueIdx: rank,
  startMs: (10 - rank) * 1000,
  context: `an invented line containing ${term}`,
  contextMatch: { start: 27, length: term.length },
  academicScore: 0,
})

const sense = (overrides: Partial<SenseWire> = {}): SenseWire => ({
  meaningVi: 'nghĩa',
  partOfSpeech: 'noun',
  isCommon: true,
  inTranscript: false,
  exampleEn: 'An example sentence.',
  exampleVi: 'Một câu ví dụ.',
  ...overrides,
})

const item = (term: string, senses: SenseWire[], overrides: Partial<ItemWire> = {}): ItemWire => ({
  term,
  ipa: '/x/',
  singleCommonSense: false,
  senses,
  ...overrides,
})

const wire = (parts: Partial<VocabWire>): VocabWire => ({ common: [], academic: [], phrases: [], ...parts })

describe('validateSenses', () => {
  it('accepts an uncommon in-transcript sense plus two common senses, in-transcript first', () => {
    const check = validateSenses(
      item('shift', [
        sense({ meaningVi: 'ca làm việc' }),
        sense({ meaningVi: 'sự chuyển dịch', isCommon: false, inTranscript: true }),
        sense({ meaningVi: 'dịch chuyển' }),
      ]),
    )

    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.senses.map((s) => s.meaningVi)).toEqual(['sự chuyển dịch', 'ca làm việc', 'dịch chuyển'])
  })

  it('counts a common in-transcript sense toward the two', () => {
    const check = validateSenses(
      item('shift', [sense({ meaningVi: 'chuyển', inTranscript: true }), sense({ meaningVi: 'ca' })]),
    )
    expect(check.ok && check.senses).toHaveLength(2)
  })

  it('rejects a card with only one common sense when the model did not declare it', () => {
    expect(validateSenses(item('shift', [sense({ inTranscript: true })]))).toEqual({
      ok: false,
      reason: 'too-few-common-senses',
    })
  })

  it('accepts one common sense when the model declares the term only has one', () => {
    const check = validateSenses(item('methodology', [sense({ inTranscript: true })], { singleCommonSense: true }))
    expect(check).toMatchObject({ ok: true, singleCommonSense: true })
  })

  it('still requires that one sense to be common, even when declared single', () => {
    const check = validateSenses(
      item('methodology', [sense({ inTranscript: true, isCommon: false })], { singleCommonSense: true }),
    )
    expect(check).toEqual({ ok: false, reason: 'too-few-common-senses' })
  })

  it('rejects a card with no in-transcript sense', () => {
    expect(validateSenses(item('x', [sense(), sense()]))).toEqual({ ok: false, reason: 'no-in-transcript-sense' })
  })

  it('rejects a card claiming two in-transcript senses', () => {
    expect(
      validateSenses(item('x', [sense({ inTranscript: true }), sense({ inTranscript: true }), sense()])),
    ).toEqual({ ok: false, reason: 'multiple-in-transcript-senses' })
  })

  it('drops a sense that has no example, which can then sink the card', () => {
    const check = validateSenses(
      item('x', [sense({ inTranscript: true }), sense({ exampleEn: '  ' })]),
    )
    expect(check).toEqual({ ok: false, reason: 'too-few-common-senses' })
  })

  it('drops a sense that is neither common nor the one in the talk', () => {
    const check = validateSenses(
      item('x', [sense({ inTranscript: true }), sense({ meaningVi: 'lạc đề', isCommon: false }), sense()]),
    )
    expect(check.ok && check.senses.map((s) => s.meaningVi)).toEqual(['nghĩa', 'nghĩa'])
  })

  it('caps the number of senses', () => {
    const many = [sense({ inTranscript: true }), ...Array.from({ length: 6 }, (_, i) => sense({ meaningVi: `n${i}` }))]
    const check = validateSenses(item('x', many))
    expect(check.ok && check.senses).toHaveLength(MAX_SENSES)
  })

  it('trims whitespace in every field it keeps', () => {
    const check = validateSenses(
      item('x', [
        sense({ inTranscript: true, meaningVi: '  a  ', exampleEn: ' b ', exampleVi: ' c ' }),
        sense(),
      ]),
    )
    expect(check.ok && check.senses[0]).toMatchObject({ meaningVi: 'a', example: { en: 'b', vi: 'c' } })
  })
})

describe('assembleGroups', () => {
  const candidates = [candidate('resilience', 0), candidate('shift', 1), candidate('figure out', 2, 'phrase')]
  const valid = (term: string, extra: Partial<ItemWire> = {}) =>
    item(term, [sense({ inTranscript: true, meaningVi: `${term}-trong-bài` }), sense()], extra)

  /** The structural guarantee: identity, quote and timestamp are ours, not the model's. */
  it('takes the quote and timestamp from the candidate, never from the model', () => {
    const { groups } = assembleGroups([wire({ common: [valid('resilience')] })], candidates)
    const card = groups[0]!.items[0]!

    expect(card.context).toBe(candidates[0]!.context)
    expect(card.startMs).toBe(candidates[0]!.startMs)
    expect(card.meaningVi).toBe('resilience-trong-bài')
  })

  it('drops terms the model invented', () => {
    const { groups, rejected } = assembleGroups([wire({ common: [valid('hallucinated')] })], candidates)
    expect(groups.flatMap((g) => g.items)).toEqual([])
    expect(rejected['unknown-term']).toBe(1)
  })

  it('matches terms case-insensitively', () => {
    const { groups } = assembleGroups([wire({ common: [valid('Resilience')] })], candidates)
    expect(groups[0]!.items[0]!.term).toBe('resilience')
  })

  it('keeps the first claim when a term appears in two groups or two batches', () => {
    const { groups, rejected } = assembleGroups(
      [wire({ common: [valid('shift')], academic: [valid('shift')] }), wire({ phrases: [valid('shift')] })],
      candidates,
    )
    expect(groups.map((g) => g.items.length)).toEqual([1, 0, 0])
    expect(rejected['duplicate-term']).toBe(2)
  })

  it('blanks IPA on phrases whatever the model sent', () => {
    const { groups } = assembleGroups([wire({ phrases: [valid('figure out', { ipa: '/fɪɡə aʊt/' })] })], candidates)
    expect(groups[2]!.items[0]!.ipa).toBe('')
  })

  it('keeps the best-ranked cards per group, then shows them in spoken order', () => {
    const { groups } = assembleGroups(
      [wire({ common: [valid('figure out'), valid('shift'), valid('resilience')] })],
      candidates,
      { maxPerGroup: 2 },
    )
    // Ranks 0 and 1 survive; startMs is higher for lower rank in the fixture.
    expect(groups[0]!.items.map((c) => c.term)).toEqual(['shift', 'resilience'])
  })

  it('counts every rejection reason', () => {
    const { rejected } = assembleGroups(
      [wire({ common: [item('resilience', [sense()]), item('shift', [sense({ inTranscript: true })])] })],
      candidates,
    )
    expect(rejected).toEqual({ 'no-in-transcript-sense': 1, 'too-few-common-senses': 1 })
  })
})

/**
 * Structured outputs require `additionalProperties: false` on every object and
 * do not support length/number constraints. This checks the schema we send.
 */
describe('wire schema is acceptable to structured outputs', () => {
  const FORBIDDEN = ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'pattern']

  function walk(node: unknown, visit: (object: Record<string, unknown>) => void) {
    if (Array.isArray(node)) node.forEach((child) => walk(child, visit))
    else if (node && typeof node === 'object') {
      visit(node as Record<string, unknown>)
      Object.values(node).forEach((child) => walk(child, visit))
    }
  }

  it('closes every object and uses no unsupported constraint', () => {
    const schema = z.toJSONSchema(VocabWireSchema)
    const problems: string[] = []

    walk(schema, (node) => {
      if (node.type === 'object' && node.additionalProperties !== false) problems.push('open object')
      for (const key of FORBIDDEN) if (key in node) problems.push(key)
    })

    expect(problems).toEqual([])
  })
})
