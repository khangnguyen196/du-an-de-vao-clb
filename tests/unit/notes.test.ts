import { describe, expect, it, vi } from 'vitest'
import { adoptAsInTranscript, mergeCardContent } from '@/lib/study/card-content'
import { isActivatableTarget, isTypingTarget, shouldIgnoreShortcut } from '@/lib/study/keyboard'
import {
  LocalNotesStore,
  NOTE_LIMITS,
  NOTES_STORAGE_KEY,
  NoteValidationError,
  validateNote,
  type CardNote,
  type NoteSense,
} from '@/lib/study/notes-store'
import type { KeyValueStorage } from '@/lib/study/srs-store'
import type { VocabSense } from '@/types/study'

const sense = (overrides: Partial<NoteSense> = {}): NoteSense => ({
  meaningVi: 'sự chuyển dịch',
  partOfSpeech: 'noun',
  inTranscript: false,
  example: { en: 'There was a shift in opinion.', vi: 'Đã có sự chuyển dịch trong quan điểm.' },
  ...overrides,
})

const modelSense = (overrides: Partial<VocabSense> = {}): VocabSense => ({
  meaningVi: 'ca làm việc',
  partOfSpeech: 'noun',
  isCommon: true,
  inTranscript: true,
  example: { en: 'She works the night shift.', vi: 'Cô ấy làm ca đêm.' },
  ...overrides,
})

const note = (senses: NoteSense[], id = 'ted:t:shift'): CardNote => ({
  id,
  senses,
  updatedAt: '2026-09-14T08:00:00.000Z',
})

function memoryStorage(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}))
  const storage: KeyValueStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
  return { storage, data }
}

describe('validateNote', () => {
  it('accepts a single meaning — no minimum count', () => {
    expect(validateNote([sense()])).toMatchObject({ ok: true })
  })

  it('trims every field it keeps', () => {
    const result = validateNote([sense({ meaningVi: '  a  ', example: { en: ' b ', vi: ' c ' } })])
    expect(result.ok && result.senses[0]).toMatchObject({ meaningVi: 'a', example: { en: 'b', vi: 'c' } })
  })

  it('requires the English example, even when only whitespace was typed', () => {
    expect(validateNote([sense({ example: { en: '   ', vi: 'Bản dịch.' } })])).toEqual({
      ok: false,
      issues: [{ scope: 'sense', senseIndex: 0, field: 'exampleEn', code: 'required' }],
    })
  })

  it('no longer asks for a Vietnamese translation of the example', () => {
    expect(validateNote([sense({ example: { en: 'An example.', vi: '' } })])).toMatchObject({ ok: true })
  })

  it('still caps a translation an older note already has', () => {
    const long = 'x'.repeat(NOTE_LIMITS.example + 1)
    expect(validateNote([sense({ example: { en: 'An example.', vi: long } })])).toEqual({
      ok: false,
      issues: [{ scope: 'sense', senseIndex: 0, field: 'exampleVi', code: 'too-long', max: NOTE_LIMITS.example }],
    })
  })

  it('points each problem at the exact meaning and field', () => {
    const result = validateNote([sense(), sense({ meaningVi: '', partOfSpeech: 'x'.repeat(NOTE_LIMITS.partOfSpeech + 1) })])
    expect(result.ok ? [] : result.issues).toEqual([
      { scope: 'sense', senseIndex: 1, field: 'meaningVi', code: 'required' },
      { scope: 'sense', senseIndex: 1, field: 'partOfSpeech', code: 'too-long', max: NOTE_LIMITS.partOfSpeech },
    ])
  })

  it('leaves part of speech optional', () => {
    expect(validateNote([sense({ partOfSpeech: '' })]).ok).toBe(true)
  })

  it('rejects two meanings both marked as the one in the talk', () => {
    const result = validateNote([sense({ inTranscript: true }), sense({ inTranscript: true })])
    expect(result.ok ? [] : result.issues).toContainEqual({ scope: 'note', code: 'multiple-in-transcript' })
  })

  it('rejects more meanings than the limit', () => {
    const result = validateNote(Array.from({ length: NOTE_LIMITS.senses + 1 }, () => sense()))
    expect(result.ok ? [] : result.issues).toContainEqual({ scope: 'note', code: 'too-many' })
  })

  it('rejects an empty note', () => {
    expect(validateNote([])).toEqual({ ok: false, issues: [{ scope: 'note', code: 'empty' }] })
  })
})

describe('LocalNotesStore', () => {
  it('round-trips a note, storing trimmed values', async () => {
    const { storage } = memoryStorage()
    const store = new LocalNotesStore(storage)
    await store.put(note([sense({ meaningVi: '  sự chuyển dịch ' })]))

    expect((await store.get('ted:t:shift'))?.senses[0]?.meaningVi).toBe('sự chuyển dịch')
    expect(await store.list()).toHaveLength(1)
  })

  it('refuses to write a note that breaks the rules', async () => {
    const store = new LocalNotesStore(memoryStorage().storage)
    await expect(store.put(note([sense({ example: { en: '', vi: '' } })]))).rejects.toBeInstanceOf(NoteValidationError)
    expect(await store.list()).toEqual([])
  })

  it('drops a single corrupt or rule-breaking record and keeps the rest', async () => {
    const onCorrupt = vi.fn()
    const { storage } = memoryStorage({
      [NOTES_STORAGE_KEY]: JSON.stringify({
        version: 1,
        notes: [
          note([sense()], 'good:a'),
          { id: 'bad-shape' },
          note([sense({ example: { en: '', vi: 'x' } })], 'bad-rules'),
          note([sense()], 'good:b'),
        ],
      }),
    })
    const store = new LocalNotesStore(storage, { onCorrupt })

    expect((await store.list()).map((n) => n.id)).toEqual(['good:a', 'good:b'])
    expect(onCorrupt).toHaveBeenCalledWith(2)
  })

  it('removes a note', async () => {
    const store = new LocalNotesStore(memoryStorage().storage)
    await store.put(note([sense()]))
    await store.remove('ted:t:shift')
    expect(await store.get('ted:t:shift')).toBeNull()
  })

  it('behaves as an empty store when storage throws', async () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = new LocalNotesStore(throwing)
    await expect(store.put(note([sense()]))).resolves.toBeUndefined()
    expect(await store.list()).toEqual([])
  })
})

describe('mergeCardContent', () => {
  it('puts the learner’s meanings before the model’s, tagged by origin', () => {
    const merged = mergeCardContent({ senses: [modelSense()] }, note([sense()]))
    expect(merged.senses.map((s) => [s.origin, s.meaningVi])).toEqual([
      ['note', 'sự chuyển dịch'],
      ['model', 'ca làm việc'],
    ])
    expect(merged.hasAnyMeaning).toBe(true)
  })

  it('lets the learner’s in-talk choice override the model’s tag', () => {
    const merged = mergeCardContent({ senses: [modelSense({ inTranscript: true })] }, note([sense({ inTranscript: true })]))
    expect(merged.senses.filter((s) => s.inTranscript).map((s) => s.origin)).toEqual(['note'])
    expect(merged.noteDecidesInTranscript).toBe(true)
  })

  it('keeps the model’s tag when the learner has not decided', () => {
    const merged = mergeCardContent({ senses: [modelSense({ inTranscript: true })] }, note([sense()]))
    expect(merged.senses.find((s) => s.origin === 'model')?.inTranscript).toBe(true)
  })

  it('works with no note and no model meanings', () => {
    expect(mergeCardContent({}, null)).toEqual({ senses: [], hasAnyMeaning: false, noteDecidesInTranscript: false })
  })
})

describe('adoptAsInTranscript', () => {
  const now = new Date('2026-09-14T09:00:00.000Z')

  it('copies the model meaning into a new note as the in-talk meaning', () => {
    const adopted = adoptAsInTranscript(null, 'ted:t:shift', modelSense(), now)
    expect(adopted).toEqual({
      id: 'ted:t:shift',
      updatedAt: now.toISOString(),
      senses: [
        {
          meaningVi: 'ca làm việc',
          partOfSpeech: 'noun',
          inTranscript: true,
          example: { en: 'She works the night shift.', vi: 'Cô ấy làm ca đêm.' },
        },
      ],
    })
    // The copy satisfies the note rules (model meanings always carry an example).
    expect(validateNote(adopted!.senses).ok).toBe(true)
  })

  it('moves the in-talk mark instead of leaving two', () => {
    const adopted = adoptAsInTranscript(note([sense({ inTranscript: true })]), 'ted:t:shift', modelSense(), now)
    expect(adopted?.senses.filter((s) => s.inTranscript).map((s) => s.meaningVi)).toEqual(['ca làm việc'])
  })

  it('marks an identical meaning already in the note rather than duplicating it', () => {
    const adopted = adoptAsInTranscript(
      note([sense({ meaningVi: 'Ca làm việc ' })]),
      'ted:t:shift',
      modelSense(),
      now,
    )
    expect(adopted?.senses).toHaveLength(1)
    expect(adopted?.senses[0]?.inTranscript).toBe(true)
  })

  it('returns null instead of pushing out a learner meaning when the note is full', () => {
    const full = note(Array.from({ length: NOTE_LIMITS.senses }, (_, i) => sense({ meaningVi: `n${i}` })))
    expect(adoptAsInTranscript(full, 'ted:t:shift', modelSense(), now)).toBeNull()
  })
})

describe('keyboard shortcut guards', () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, isContentEditable = false) => ({
    tagName,
    isContentEditable,
    getAttribute: (name: string) => attrs[name] ?? null,
  })

  it('treats text fields and editable regions as typing', () => {
    expect(isTypingTarget(el('input'))).toBe(true)
    expect(isTypingTarget(el('INPUT', { type: 'search' }))).toBe(true)
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true)
    expect(isTypingTarget(el('SELECT'))).toBe(true)
    expect(isTypingTarget(el('DIV', {}, true))).toBe(true)
  })

  it('does not treat buttons, checkboxes or the page as typing', () => {
    expect(isTypingTarget(el('BUTTON'))).toBe(false)
    expect(isTypingTarget(el('INPUT', { type: 'checkbox' }))).toBe(false)
    expect(isTypingTarget(el('BODY'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })

  it('recognises controls that Space presses natively', () => {
    expect(isActivatableTarget(el('BUTTON'))).toBe(true)
    expect(isActivatableTarget(el('A'))).toBe(true)
    expect(isActivatableTarget(el('INPUT', { type: 'checkbox' }))).toBe(true)
    expect(isActivatableTarget(el('DIV', { role: 'button' }))).toBe(true)
    expect(isActivatableTarget(el('BODY'))).toBe(false)
  })

  it('ignores every shortcut while typing, and only Space on a focused control', () => {
    expect(shouldIgnoreShortcut({ key: '3', target: el('TEXTAREA') })).toBe(true)
    expect(shouldIgnoreShortcut({ key: ' ', code: 'Space', target: el('INPUT') })).toBe(true)
    expect(shouldIgnoreShortcut({ key: ' ', code: 'Space', target: el('BUTTON') })).toBe(true)
    expect(shouldIgnoreShortcut({ key: '3', target: el('BUTTON') })).toBe(false)
    expect(shouldIgnoreShortcut({ key: ' ', code: 'Space', target: el('BODY') })).toBe(false)
  })
})
