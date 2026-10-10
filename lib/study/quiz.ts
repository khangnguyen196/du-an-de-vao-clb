import { mergeCardContent } from '@/lib/study/card-content'
import type { CardNote } from '@/lib/study/notes-store'
import type { ReviewRecord } from '@/lib/study/srs-store'
import type { VocabSense } from '@/types/study'

/**
 * Vocabulary quiz, built entirely from data the app already holds: the line
 * the speaker said and the meanings the learner (or a model) wrote. No model
 * call, so it works with no key and no credit.
 *
 * Quiz answers never touch the review schedule. FSRS spaces reviews by when a
 * card falls due; folding in extra off-schedule practice would stretch the
 * intervals and make words come back too late.
 */

export const QUIZ_KINDS = ['cloze', 'meaningToWord', 'wordToMeaning', 'typing'] as const
export type QuizKind = (typeof QUIZ_KINDS)[number]

export const OPTION_COUNT = 4

/** One word as the quiz sees it, whichever page it came from. */
export interface QuizItem {
  /** Same id as the review record and the learner's note. */
  id: string
  term: string
  display: string
  /** Learner's own meaning first, then the model's; empty when neither exists. */
  meaning: string
  context: string
  /** Absent on records saved before quizzes existed — no fill-in-the-line for those. */
  contextMatch?: { start: number; length: number }
  startMs: number
  sourceTitle: string
  sourcePath: string
}

interface QuestionBase {
  itemId: string
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'cloze' | 'meaningToWord' | 'wordToMeaning'
  options: string[]
  correctIndex: number
}

export interface TypingQuestion extends QuestionBase {
  kind: 'typing'
  /** Accepted spellings, already normalised. */
  accepted: string[]
}

export type QuizQuestion = ChoiceQuestion | TypingQuestion

// --- building items -----------------------------------------------------------

function meaningOf(card: { senses?: readonly VocabSense[]; meaningVi: string }, note: CardNote | null | undefined) {
  return (mergeCardContent(card, note).senses[0]?.meaningVi || card.meaningVi).trim()
}

export function itemFromRecord(record: ReviewRecord, note: CardNote | null | undefined): QuizItem {
  const { snapshot } = record
  return {
    id: record.id,
    term: record.term,
    display: snapshot.display,
    meaning: meaningOf(snapshot, note),
    context: snapshot.context,
    ...(snapshot.contextMatch ? { contextMatch: snapshot.contextMatch } : {}),
    startMs: snapshot.startMs,
    sourceTitle: snapshot.sourceTitle,
    sourcePath: snapshot.sourcePath,
  }
}

export function itemFromCard(
  card: {
    term: string
    display: string
    meaningVi: string
    senses: readonly VocabSense[]
    context: string
    contextMatch: { start: number; length: number }
    startMs: number
  },
  source: { id: string; sourceTitle: string; sourcePath: string },
  note: CardNote | null | undefined,
): QuizItem {
  return {
    id: source.id,
    term: card.term,
    display: card.display,
    meaning: meaningOf(card, note),
    context: card.context,
    contextMatch: card.contextMatch,
    startMs: card.startMs,
    sourceTitle: source.sourceTitle,
    sourcePath: source.sourcePath,
  }
}

// --- text helpers -------------------------------------------------------------

/** Case-, spacing- and apostrophe-insensitive; Vietnamese diacritics kept. */
export function normalizeAnswer(text: string): string {
  return text.replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

/** The slice of the speaker's line that a fill-in question blanks out, or null when unknown. */
export function clozeParts(item: QuizItem): { before: string; said: string; after: string } | null {
  const match = item.contextMatch
  if (!match) return null
  const said = item.context.slice(match.start, match.start + match.length)
  if (!said.trim() || match.start + match.length > item.context.length) return null
  return {
    before: item.context.slice(0, match.start),
    said,
    after: item.context.slice(match.start + match.length),
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when the answer is still readable elsewhere in the line — `"Ditto."
 * Because "ditto" was their secret` gives itself away once the first one is
 * blanked. Such a word is not asked as a fill-in; the other kinds still work.
 */
export function clozeGivesAwayAnswer(item: QuizItem): boolean {
  const parts = clozeParts(item)
  if (!parts) return false
  const rest = normalizeAnswer(`${parts.before} ${parts.after}`)
  return [parts.said, item.term].some((form) =>
    new RegExp(`(^|[^\\p{L}])${escapeForRegex(normalizeAnswer(form))}($|[^\\p{L}])`, 'u').test(rest),
  )
}

const isPhrase = (item: QuizItem) => item.term.includes(' ')

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const out = [...values]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Three wrong answers for `item`, as option text.
 *
 * Same shape first (word with words, phrase with phrases) and close in length,
 * so the right answer cannot be picked out by looking odd. Options must all
 * differ once normalised — two identical buttons would make one "wrong" choice
 * actually right.
 */
function distractors(
  item: QuizItem,
  pool: readonly QuizItem[],
  textOf: (candidate: QuizItem) => string | null,
  random: () => number,
): string[] | null {
  const answer = textOf(item)
  if (!answer) return null

  const seen = new Set([normalizeAnswer(answer)])
  const ranked = shuffle(
    pool.filter((candidate) => candidate.id !== item.id),
    random,
  )
    .map((candidate) => ({ candidate, text: textOf(candidate) }))
    .filter((entry): entry is { candidate: QuizItem; text: string } => Boolean(entry.text))
    .sort(
      (a, b) =>
        Number(isPhrase(a.candidate) !== isPhrase(item)) - Number(isPhrase(b.candidate) !== isPhrase(item)) ||
        Math.abs(a.text.length - answer.length) - Math.abs(b.text.length - answer.length),
    )

  const picked: string[] = []
  // Draw from the closest handful rather than always the closest three, so a
  // retake does not show the very same options.
  const shortlist = ranked.slice(0, Math.max(OPTION_COUNT * 2, 6))
  for (const entry of shuffle(shortlist, random).concat(ranked)) {
    const key = normalizeAnswer(entry.text)
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(entry.text)
    if (picked.length === OPTION_COUNT - 1) return picked
  }
  return null
}

const clozeText = (item: QuizItem) => clozeParts(item)?.said.toLowerCase() ?? null
const displayText = (item: QuizItem) => item.display
const meaningText = (item: QuizItem) => item.meaning || null

function choice(
  kind: ChoiceQuestion['kind'],
  item: QuizItem,
  pool: readonly QuizItem[],
  textOf: (candidate: QuizItem) => string | null,
  random: () => number,
): ChoiceQuestion | null {
  const answer = textOf(item)
  const wrong = distractors(item, pool, textOf, random)
  if (!answer || !wrong) return null

  const options = shuffle([answer, ...wrong], random)
  return { kind, itemId: item.id, options, correctIndex: options.indexOf(answer) }
}

function makeQuestion(
  kind: QuizKind,
  item: QuizItem,
  pool: readonly QuizItem[],
  random: () => number,
): QuizQuestion | null {
  switch (kind) {
    case 'cloze':
      return clozeGivesAwayAnswer(item) ? null : choice('cloze', item, pool, clozeText, random)
    case 'meaningToWord':
      return item.meaning ? choice('meaningToWord', item, pool, displayText, random) : null
    case 'wordToMeaning':
      return item.meaning ? choice('wordToMeaning', item, pool, meaningText, random) : null
    case 'typing': {
      if (!item.meaning) return null
      const accepted = [...new Set([item.display, item.term].map(normalizeAnswer))]
      return { kind: 'typing', itemId: item.id, accepted }
    }
  }
}

export interface BuildQuizOptions {
  count: number
  kinds: readonly QuizKind[]
  random?: () => number
}

/**
 * Picks `count` different words and asks one question about each.
 *
 * Each word gets the least-used kind it can support, so a ten-question quiz
 * with all four kinds on mixes them instead of asking ten fill-ins. A word
 * with no meaning can only be a fill-in; a word with neither a meaning nor a
 * known position in its line is skipped.
 */
export function buildQuiz(items: readonly QuizItem[], options: BuildQuizOptions): QuizQuestion[] {
  const random = options.random ?? Math.random
  const used = new Map<QuizKind, number>(options.kinds.map((kind) => [kind, 0]))
  const questions: QuizQuestion[] = []

  for (const item of shuffle(items, random)) {
    if (questions.length >= options.count) break

    const order = shuffle(options.kinds, random).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))
    for (const kind of order) {
      const question = makeQuestion(kind, item, items, random)
      if (!question) continue
      questions.push(question)
      used.set(kind, (used.get(kind) ?? 0) + 1)
      break
    }
  }

  return questions
}

/** How many of these words can be asked about with the chosen kinds. */
export function askableCount(items: readonly QuizItem[], kinds: readonly QuizKind[]): number {
  const fixed = () => 0.5
  return items.filter((item) => kinds.some((kind) => makeQuestion(kind, item, items, fixed) !== null)).length
}

export function isCorrect(question: QuizQuestion, answer: number | string): boolean {
  if (question.kind === 'typing') return typeof answer === 'string' && question.accepted.includes(normalizeAnswer(answer))
  return answer === question.correctIndex
}
