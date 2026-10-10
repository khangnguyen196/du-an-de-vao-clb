import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildTranslationUserPrompt } from '@/lib/ai/prompts'
import {
  applyTranslations,
  buildTranslationBatches,
  mergeTranslations,
  TranslationWireSchema,
  type TranslationWire,
} from '@/lib/ai/translate-core'
import type { Cue } from '@/types/transcript'

const cues: Cue[] = Array.from({ length: 95 }, (_, idx) => ({
  idx,
  startMs: idx * 3000,
  endMs: idx * 3000 + 3000,
  text: `English line ${idx}.`,
}))

describe('buildTranslationBatches', () => {
  const batches = buildTranslationBatches(cues, 40, 2)

  it('splits into fixed-size batches that cover every cue exactly once', () => {
    expect(batches.map((b) => b.lines.length)).toEqual([40, 40, 15])
    expect(batches.flatMap((b) => b.lines.map((l) => l.index))).toEqual(cues.map((_, i) => i))
  })

  it('attaches neighbouring lines as context without translating them', () => {
    expect(batches[0]!.before).toEqual([])
    expect(batches[0]!.after).toEqual(['English line 40.', 'English line 41.'])
    expect(batches[1]!.before).toEqual(['English line 38.', 'English line 39.'])
    expect(batches[2]!.after).toEqual([])
  })

  it('returns nothing for an empty transcript', () => {
    expect(buildTranslationBatches([], 40, 2)).toEqual([])
  })
})

describe('mergeTranslations', () => {
  const small = cues.slice(0, 6)
  const batches = buildTranslationBatches(small, 3, 1)

  it('places each answer under its own line', () => {
    const outputs: TranslationWire[] = [
      { lines: [0, 1, 2].map((index) => ({ index, vi: `Dòng ${index}.` })) },
      { lines: [3, 4, 5].map((index) => ({ index, vi: `Dòng ${index}.` })) },
    ]
    const { texts, coverage } = mergeTranslations(small, batches, outputs)
    expect(texts).toEqual(['Dòng 0.', 'Dòng 1.', 'Dòng 2.', 'Dòng 3.', 'Dòng 4.', 'Dòng 5.'])
    expect(coverage).toBe(1)
  })

  /** A batch may only write the lines it was asked to translate. */
  it('ignores answers for context lines, other batches, or invented indices', () => {
    const outputs: (TranslationWire | null)[] = [
      {
        lines: [
          { index: 0, vi: 'hợp lệ' },
          { index: 3, vi: 'dòng ngữ cảnh — không được ghi' },
          { index: 99, vi: 'bịa' },
          { index: 1.5, vi: 'không nguyên' },
        ],
      },
      null,
    ]
    const { texts } = mergeTranslations(small, batches, outputs)
    expect(texts).toEqual(['hợp lệ', null, null, null, null, null])
  })

  it('leaves a failed batch empty rather than guessing', () => {
    const { texts, coverage } = mergeTranslations(small, batches, [null, { lines: [{ index: 4, vi: 'x' }] }])
    expect(texts).toEqual([null, null, null, null, 'x', null])
    expect(coverage).toBeCloseTo(1 / 6)
  })

  it('keeps the first answer when a line is answered twice, and drops blank answers', () => {
    const { texts } = mergeTranslations(small, batches, [
      {
        lines: [
          { index: 0, vi: 'đầu tiên' },
          { index: 0, vi: 'thứ hai' },
          { index: 1, vi: '   ' },
        ],
      },
    ])
    expect(texts.slice(0, 2)).toEqual(['đầu tiên', null])
  })
})

describe('buildTranslationUserPrompt', () => {
  it('numbers only the lines to translate and labels context separately', () => {
    const [, middle] = buildTranslationBatches(cues.slice(0, 9), 3, 1)
    const prompt = buildTranslationUserPrompt(middle!, { title: 'Some Talk' })

    expect(prompt).toContain('[3] English line 3.')
    expect(prompt).toContain('[5] English line 5.')
    expect(prompt).not.toContain('[2]')
    expect(prompt).not.toContain('[6]')
    expect(prompt).toMatch(/Context before \(do not translate\):\n {2}English line 2\./)
    expect(prompt).toMatch(/Context after \(do not translate\):\n {2}English line 6\./)
  })
})

describe('translation wire schema', () => {
  it('uses no constraint structured outputs reject', () => {
    const text = JSON.stringify(z.toJSONSchema(TranslationWireSchema))
    for (const key of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) {
      expect(text).not.toContain(`"${key}"`)
    }
    expect(text).toContain('"additionalProperties":false')
  })
})

describe('applyTranslations', () => {
  const three = cues.slice(0, 3)

  it('puts each text under its own cue and leaves the rest of the cue alone', () => {
    const applied = applyTranslations(three, ['Dòng 0.', 'Dòng 1.', 'Dòng 2.'])
    expect(applied.map((cue) => cue.translation)).toEqual(['Dòng 0.', 'Dòng 1.', 'Dòng 2.'])
    expect(applied[1]).toMatchObject({ idx: 1, startMs: 3000, text: 'English line 1.' })
  })

  /* An empty line must stay absent, never become "" — the pane renders a blank
     translation row as if the translator had written nothing, which is a lie. */
  it('leaves an untranslated line without a translation key at all', () => {
    const applied = applyTranslations(three, ['Dòng 0.', null, ''])
    expect('translation' in applied[1]!).toBe(false)
    expect('translation' in applied[2]!).toBe(false)
  })

  it('does not mutate the cues it was given', () => {
    const applied = applyTranslations(three, ['Dòng 0.', null, null])
    expect(three[0]!.translation).toBeUndefined()
    expect(applied[0]).not.toBe(three[0])
  })

  it('tolerates a texts array shorter than the transcript', () => {
    const applied = applyTranslations(three, ['Dòng 0.'])
    expect(applied.map((cue) => cue.translation)).toEqual(['Dòng 0.', undefined, undefined])
  })
})
