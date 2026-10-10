import { describe, expect, it } from 'vitest'
import {
  askableCount,
  buildQuiz,
  clozeParts,
  isCorrect,
  normalizeAnswer,
  OPTION_COUNT,
  QUIZ_KINDS,
  type ChoiceQuestion,
  type QuizItem,
} from '@/lib/study/quiz'
import { lastAttempt, MAX_ATTEMPTS, QUIZ_STORAGE_KEY, readAttempts, recordAttempt } from '@/lib/study/quiz-store'

/** Invented fixtures — not quotes from any talk. */
function item(term: string, meaning = '', line?: string, said = term): QuizItem {
  const context = line ?? `we talked about ${term} for a while`
  const start = context.toLowerCase().indexOf(said.toLowerCase())
  return {
    id: `ted:talk:${term}`,
    term,
    display: term,
    meaning,
    context,
    contextMatch: { start, length: said.length },
    startMs: 1000,
    sourceTitle: 'Talk',
    sourcePath: '/watch/ted/talk/vocab',
  }
}

/** Deterministic stand-in for Math.random. */
function seeded(seed = 42): () => number {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

const meanings = ['sự kiên cường', 'sự hợp nhau', 'giả định', 'sự chân thật', 'thuộc tính', 'mối quan hệ']
const words = ['resilience', 'compatibility', 'assumption', 'authenticity', 'attributes', 'relationship']
const withMeanings = words.map((word, i) => item(word, meanings[i]))
const bare = words.map((word) => item(word))

describe('buildQuiz', () => {
  it('asks about each word at most once and never more than asked for', () => {
    const quiz = buildQuiz(withMeanings, { count: 4, kinds: QUIZ_KINDS, random: seeded() })
    expect(quiz).toHaveLength(4)
    expect(new Set(quiz.map((q) => q.itemId)).size).toBe(4)
  })

  it('caps at the number of words available', () => {
    expect(buildQuiz(withMeanings, { count: 20, kinds: QUIZ_KINDS, random: seeded() })).toHaveLength(words.length)
  })

  it('mixes kinds instead of repeating one', () => {
    const quiz = buildQuiz(withMeanings, { count: 4, kinds: QUIZ_KINDS, random: seeded(7) })
    expect(new Set(quiz.map((q) => q.kind)).size).toBe(4)
  })

  it('only fills in the line when no word has a meaning', () => {
    const quiz = buildQuiz(bare, { count: 6, kinds: QUIZ_KINDS, random: seeded() })
    expect(quiz.length).toBeGreaterThan(0)
    expect(quiz.every((q) => q.kind === 'cloze')).toBe(true)
  })

  it('gives every choice question four distinct options with the answer among them', () => {
    for (let seed = 1; seed < 30; seed += 1) {
      for (const q of buildQuiz(withMeanings, { count: 6, kinds: QUIZ_KINDS, random: seeded(seed) })) {
        if (q.kind === 'typing') continue
        expect(q.options).toHaveLength(OPTION_COUNT)
        expect(new Set(q.options.map(normalizeAnswer)).size).toBe(OPTION_COUNT)
        expect(q.correctIndex).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('makes the right option the word that was actually said, as said', () => {
    const items = [
      item('run into', '', 'We kept running into the same wall.', 'running into'),
      item('figure out', '', 'They had to figure out the cost.'),
      item('cut down', '', 'A city can cut down emissions.'),
      item('turn out', '', 'It turns out that it worked.', 'turns out'),
    ]
    const quiz = buildQuiz(items, { count: 4, kinds: ['cloze'], random: seeded() }) as ChoiceQuestion[]
    const runInto = quiz.find((q) => q.itemId === 'ted:talk:run into')!
    expect(runInto.options[runInto.correctIndex]).toBe('running into')
  })

  it('cannot build a choice question without three other words to draw from', () => {
    const quiz = buildQuiz(withMeanings.slice(0, 3), { count: 3, kinds: ['cloze', 'wordToMeaning'], random: seeded() })
    expect(quiz).toEqual([])
  })

  it('skips old records that know no position in their line and have no meaning', () => {
    const old: QuizItem = { ...item('legacy'), contextMatch: undefined }
    expect(askableCount([old, ...bare], ['cloze'])).toBe(bare.length)
  })
})

describe('clozeParts', () => {
  it('splits the line exactly around what was said', () => {
    const parts = clozeParts(item('relationship', '', '… as a relationship’s lovemotif.', 'relationship’s'))!
    expect(parts.before + parts.said + parts.after).toBe('… as a relationship’s lovemotif.')
    expect(parts.said).toBe('relationship’s')
  })

  /** Found in a real talk: the speaker repeats the word in the same line. */
  it('is not used when the answer appears again in the line', () => {
    const repeated = item('ditto', '', '"Ditto." Because "ditto" was their secret …', 'Ditto')
    const others = ['define', 'matter', 'failure'].map((word) => item(word))
    expect(buildQuiz([repeated, ...others], { count: 4, kinds: ['cloze'], random: seeded() }).map((q) => q.itemId)).not.toContain(
      repeated.id,
    )
  })

  it('also catches the dictionary form repeated next to an inflected one', () => {
    const line = 'We kept running into walls; you run into them too.'
    const parts = item('run into', '', line, 'running into')
    const others = ['define', 'matter', 'failure'].map((word) => item(word))
    const quiz = buildQuiz([parts, ...others], { count: 4, kinds: ['cloze'], random: seeded() })
    expect(quiz.map((q) => q.itemId)).not.toContain(parts.id)
  })

  it('does not flag a word that only appears inside a longer one', () => {
    const fine = item('art', '', 'The art of the start.', 'art')
    const others = ['define', 'matter', 'failure'].map((word) => item(word))
    const quiz = buildQuiz([fine, ...others], { count: 4, kinds: ['cloze'], random: seeded() })
    expect(quiz.map((q) => q.itemId)).toContain(fine.id)
  })

  it('refuses an offset that runs past the line', () => {
    expect(clozeParts({ ...item('x'), contextMatch: { start: 2, length: 500 } })).toBeNull()
  })
})

describe('isCorrect', () => {
  it('accepts a typed answer regardless of case, spacing and apostrophe style', () => {
    const quiz = buildQuiz([item("don't mind", 'không phiền')], { count: 1, kinds: ['typing'], random: seeded() })
    expect(isCorrect(quiz[0]!, "  DON’T   mind ")).toBe(true)
    expect(isCorrect(quiz[0]!, 'dont mind')).toBe(false)
  })

  it('checks a choice by index', () => {
    const [q] = buildQuiz(withMeanings, { count: 1, kinds: ['meaningToWord'], random: seeded() }) as ChoiceQuestion[]
    expect(isCorrect(q!, q!.correctIndex)).toBe(true)
    expect(isCorrect(q!, (q!.correctIndex + 1) % OPTION_COUNT)).toBe(false)
  })
})

describe('quiz history', () => {
  function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
    const data = new Map<string, string>()
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
  }

  const attempt = (scope: string, correct: number) => ({
    scope,
    at: '2026-10-10T08:00:00.000Z',
    total: 10,
    correct,
    wrongIds: [],
  })

  it('returns the latest attempt for a scope', () => {
    const store = memory()
    recordAttempt(attempt('ted:a', 5), store)
    recordAttempt(attempt('book', 9), store)
    recordAttempt(attempt('ted:a', 7), store)
    expect(lastAttempt('ted:a', store)?.correct).toBe(7)
  })

  it('keeps only the newest attempts', () => {
    const store = memory()
    for (let i = 0; i < MAX_ATTEMPTS + 5; i += 1) recordAttempt(attempt('book', i % 10), store)
    expect(readAttempts(store)).toHaveLength(MAX_ATTEMPTS)
  })

  it('drops a corrupt entry without losing the rest', () => {
    const store = memory()
    store.data.set(QUIZ_STORAGE_KEY, JSON.stringify({ version: 1, attempts: [{ scope: '' }, attempt('book', 3)] }))
    expect(readAttempts(store).map((a) => a.correct)).toEqual([3])
  })

  it('reads unreadable storage as empty', () => {
    const store = memory()
    store.data.set(QUIZ_STORAGE_KEY, '{not json')
    expect(readAttempts(store)).toEqual([])
  })
})
