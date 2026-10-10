import { NoOutputGeneratedError, zodSchema } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import type { StructuredGenerator, StructuredRequest } from '@/lib/ai/structured'
import { translateCues, TRANSLATION_CONCURRENCY } from '@/lib/ai/translate'
import { TranslationWireSchema, type TranslationWire } from '@/lib/ai/translate-core'
import { generateVocabSet, VOCAB_BATCH_SIZE } from '@/lib/ai/vocabulary'
import { VocabWireSchema, type VocabWire } from '@/lib/ai/vocab-schema'
import { AppError } from '@/lib/errors'
import type { VocabCandidate } from '@/lib/study/candidates'
import type { Cue } from '@/types/transcript'

/*
 * These tests use a hand-written stand-in for the model. They prove the
 * orchestration — batching, retry rules, failure isolation, concurrency — and
 * nothing about whether Claude answers well. That needs a real key.
 */

const candidates: VocabCandidate[] = Array.from({ length: 90 }, (_, i) => ({
  term: `term${i}`,
  display: `term${i}`,
  kind: 'word',
  count: 1,
  cueIdx: i,
  startMs: i * 1000,
  context: `an invented line with term${i}`,
  contextMatch: { start: 21, length: `term${i}`.length },
  academicScore: 0,
}))

function answerFor(prompt: string): VocabWire {
  const terms = [...prompt.matchAll(/\d+\. (term\d+) /g)].map((m) => m[1]!)
  return {
    common: terms.slice(0, 1).map((term) => ({
      term,
      ipa: '',
      singleCommonSense: true,
      senses: [
        {
          meaningVi: 'nghĩa',
          partOfSpeech: 'noun',
          isCommon: true,
          inTranscript: true,
          exampleEn: 'An example.',
          exampleVi: 'Ví dụ.',
        },
      ],
    })),
    academic: [],
    phrases: [],
  }
}

const stub = (impl: (request: StructuredRequest<unknown>) => Promise<unknown>) =>
  vi.fn(impl) as unknown as StructuredGenerator & ReturnType<typeof vi.fn>

describe('generateVocabSet orchestration', () => {
  it('splits candidates into batches and assembles every answer', async () => {
    const generate = stub(async (request) => answerFor(request.prompt))
    const set = await generateVocabSet({ title: 'T', candidates }, { generate })

    expect(generate).toHaveBeenCalledTimes(Math.ceil(candidates.length / VOCAB_BATCH_SIZE))
    expect(set.groups[0]!.items.map((c) => c.term)).toEqual(['term0', 'term40', 'term80'])
    expect(set.hasMeanings).toBe(true)
  })

  it('never sends a temperature or other sampling parameter in the request it builds', async () => {
    const generate = stub(async (request) => answerFor(request.prompt))
    await generateVocabSet({ title: 'T', candidates: candidates.slice(0, 5) }, { generate })
    const request = generate.mock.calls[0]![0] as Record<string, unknown>
    expect(Object.keys(request)).not.toContain('temperature')
  })

  it('retries a batch once when the answer is unusable', async () => {
    let calls = 0
    const generate = stub(async (request) => {
      calls += 1
      if (calls === 1) throw new NoOutputGeneratedError({ message: 'bad json' })
      return answerFor(request.prompt)
    })
    const set = await generateVocabSet({ title: 'T', candidates: candidates.slice(0, 10) }, { generate })

    expect(calls).toBe(2)
    expect(set.groups[0]!.items).toHaveLength(1)
  })

  it('does not retry errors that another attempt cannot fix', async () => {
    const generate = stub(async () => {
      throw new Error('401 unauthorized')
    })
    await expect(generateVocabSet({ title: 'T', candidates: candidates.slice(0, 10) }, { generate })).rejects.toBeInstanceOf(
      AppError,
    )
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('keeps the batches that worked when one batch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const generate = stub(async (request) => {
      if (request.prompt.includes('term40 ')) throw new Error('boom')
      return answerFor(request.prompt)
    })
    const set = await generateVocabSet({ title: 'T', candidates }, { generate })

    expect(set.groups[0]!.items.map((c) => c.term)).toEqual(['term0', 'term80'])
    warn.mockRestore()
  })

  it('fails with AI_FAILED when every batch fails', async () => {
    const generate = stub(async () => {
      throw new NoOutputGeneratedError()
    })
    await expect(generateVocabSet({ title: 'T', candidates }, { generate })).rejects.toMatchObject({ code: 'AI_FAILED' })
  })

  it('refuses to run without a key when no generator is injected', async () => {
    const previous = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateVocabSet({ title: 'T', candidates })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' })
    if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous
  })
})

describe('translateCues orchestration', () => {
  const cues: Cue[] = Array.from({ length: 100 }, (_, idx) => ({
    idx,
    startMs: idx * 1000,
    endMs: idx * 1000 + 1000,
    text: `Line ${idx}.`,
  }))

  const echo = (prompt: string): TranslationWire => ({
    lines: [...prompt.matchAll(/^\[(\d+)\] /gm)].map((m) => ({ index: Number(m[1]), vi: `Dòng ${m[1]}.` })),
  })

  it('translates every line and marks the result as machine translation', async () => {
    const generate = stub(async (request) => echo(request.prompt))
    const result = await translateCues({ cues, title: 'T' }, { generate })

    expect(result?.translation).toMatchObject({ origin: 'model', lang: 'vi', coverage: 1, credits: [] })
    expect(result?.texts[57]).toBe('Dòng 57.')
    expect(result?.texts).toHaveLength(cues.length)
  })

  it('never runs more batches at once than the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const generate = stub(async (request) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return echo(request.prompt)
    })
    await translateCues({ cues, title: 'T' }, { generate })
    expect(peak).toBeLessThanOrEqual(TRANSLATION_CONCURRENCY)
  })

  it('leaves a failed batch untranslated and reports the gap in coverage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const generate = stub(async (request) => {
      if (request.prompt.includes('[0] ')) throw new Error('boom')
      return echo(request.prompt)
    })
    const result = await translateCues({ cues, title: 'T' }, { generate })

    expect(result?.texts[0]).toBeNull()
    expect(result?.texts[40]).toBe('Dòng 40.')
    expect(result?.translation.coverage).toBeCloseTo(0.6)
    warn.mockRestore()
  })

  /*
   * A partial failure is absorbed, but a total one is not: when every batch
   * fails the cause is almost always one the operator must act on (no credit, a
   * rejected key), and swallowing it would leave the page unable to say which.
   */
  it('rethrows the first batch error when nothing at all came back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const generate = stub(async () => {
      throw new Error('credit balance is too low')
    })
    await expect(translateCues({ cues, title: 'T' }, { generate })).rejects.toThrow('credit balance is too low')
    warn.mockRestore()
  })

  it('returns null rather than an empty machine translation when there is nothing to translate', async () => {
    const generate = stub(async () => ({ lines: [] }))
    expect(await translateCues({ cues: [], title: 'T' }, { generate })).toBeNull()
  })
})

/** The schema the AI SDK actually sends, not just our own conversion of it. */
describe('schemas as converted by the AI SDK', () => {
  const FORBIDDEN = ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'pattern']

  function problems(node: unknown, found: string[] = []): string[] {
    if (Array.isArray(node)) node.forEach((child) => problems(child, found))
    else if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>
      if (record.type === 'object' && record.additionalProperties !== false) found.push('open object')
      for (const key of FORBIDDEN) if (key in record) found.push(key)
      Object.values(record).forEach((child) => problems(child, found))
    }
    return found
  }

  it('vocabulary schema is closed and constraint-free', async () => {
    const json = await zodSchema(VocabWireSchema).jsonSchema
    expect(problems(json)).toEqual([])
  })

  it('translation schema is closed and constraint-free', async () => {
    const json = await zodSchema(TranslationWireSchema).jsonSchema
    expect(problems(json)).toEqual([])
  })
})
