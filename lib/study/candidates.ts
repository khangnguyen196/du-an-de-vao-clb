import { verbForms } from '@/lib/study/inflect'
import {
  ACADEMIC_SUFFIXES,
  CONTRACTION_TAILS,
  EXPRESSIONS,
  PHRASAL_VERBS,
  STOPWORDS,
} from '@/lib/study/wordlists'
import type { Cue } from '@/types/transcript'

export interface VocabCandidate {
  /** Lowercased key — unique across the result set, and the dictionary form. */
  term: string
  /** Surface form to show on a card. */
  display: string
  kind: 'word' | 'phrase'
  /** Occurrences across the whole transcript. */
  count: number
  /** Cue of the FIRST occurrence — the card links back here. */
  cueIdx: number
  startMs: number
  /** A handful of words around the first occurrence, sliced from the cue. */
  context: string
  /**
   * Where the term sits inside `context`, as the speaker said it — "kept
   * running into" for "run into". Character offsets into `context`, so a quiz
   * can blank out exactly what was said without searching for it again.
   */
  contextMatch: ContextMatch
  /** Ordering hint only, never a final verdict on register. */
  academicScore: number
}

export interface ContextMatch {
  start: number
  length: number
}

const CONTEXT_WORDS_EACH_SIDE = 6
const MIN_WORD_LENGTH = 4
const DEFAULT_LIMIT = 120

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Strips surrounding punctuation and possessives; keeps inner hyphens. */
function normalizeToken(raw: string): string {
  const lowered = raw.toLowerCase()
  const stripped = lowered.replace(/^[^a-z]+/, '').replace(/[^a-z-]+$/, '')
  const [stem] = stripped.split(/['’]/)
  return (stem ?? '').replace(/^-+|-+$/g, '')
}

/**
 * Catches inflected forms of words the learner already owns. Without this,
 * "story" is filtered but "stories" sails through and earns a pointless card.
 */
function isAlreadyKnown(term: string): boolean {
  if (STOPWORDS.has(term)) return true

  if (term.endsWith('ies') && STOPWORDS.has(`${term.slice(0, -3)}y`)) return true
  if (term.endsWith('es') && STOPWORDS.has(term.slice(0, -2))) return true
  if (term.endsWith('s') && STOPWORDS.has(term.slice(0, -1))) return true
  if (term.endsWith('ed') && STOPWORDS.has(term.slice(0, -2))) return true
  if (term.endsWith('ing') && STOPWORDS.has(term.slice(0, -3))) return true

  return false
}

function isAcademicLooking(term: string): number {
  const hit = ACADEMIC_SUFFIXES.some((suffix) => term.endsWith(suffix))
  // Length is a weak but real register signal on top of morphology.
  return (hit ? 2 : 0) + (term.length >= 10 ? 1 : 0)
}

interface PhraseTarget {
  term: string
  pattern: RegExp
}

/**
 * Built once. A phrasal verb is matched across its inflections ("kept running
 * into" must hit `run into`); a fixed expression is matched literally, because
 * inflecting an idiom produces nonsense.
 */
let phraseTargetCache: PhraseTarget[] | null = null

function phraseTargets(): PhraseTarget[] {
  if (phraseTargetCache) return phraseTargetCache

  const targets: PhraseTarget[] = []

  for (const phrase of PHRASAL_VERBS) {
    const [verb, ...rest] = phrase.split(' ')
    if (!verb) continue

    const forms = verbForms(verb).map(escapeForRegex).join('|')
    const tail = rest.map(escapeForRegex).join('\\s+')
    const body = tail ? `(?:${forms})\\s+${tail}` : `(?:${forms})`
    targets.push({ term: phrase, pattern: new RegExp(`\\b${body}\\b`, 'gi') })
  }

  for (const expression of EXPRESSIONS) {
    const body = escapeForRegex(expression).replace(/\s+/g, '\\s+')
    targets.push({ term: expression, pattern: new RegExp(`\\b${body}\\b`, 'gi') })
  }

  phraseTargetCache = targets
  return targets
}

/**
 * A window of words around `matchIndex`, so the learner gets context, not a
 * paragraph.
 *
 * The window is taken as character offsets and sliced straight out of `text`,
 * never split into words and rejoined. Rejoining rebuilds the spacing rather
 * than preserving it ("across the board." came back as "across the board ."),
 * and the moment the quote stops being a literal substring of the cue, the
 * promise that a card never misquotes the speaker is gone.
 */
function contextAround(
  text: string,
  matchIndex: number,
  matchLength: number,
): { context: string; contextMatch: ContextMatch } {
  const beforeWords = [...text.slice(0, matchIndex).matchAll(/\S+/g)]
  const afterWords = [...text.slice(matchIndex + matchLength).matchAll(/\S+/g)]

  const clippedStart = beforeWords.length > CONTEXT_WORDS_EACH_SIDE
  const start = clippedStart
    ? (beforeWords[beforeWords.length - CONTEXT_WORDS_EACH_SIDE]?.index ?? 0)
    : 0

  const tailCount = Math.min(afterWords.length, CONTEXT_WORDS_EACH_SIDE)
  const lastTailWord = tailCount > 0 ? afterWords[tailCount - 1] : undefined
  const end =
    lastTailWord === undefined
      ? matchIndex + matchLength
      : matchIndex + matchLength + lastTailWord.index + lastTailWord[0].length

  const window = text.slice(start, end)
  const core = window.trim()
  const leading = window.length - window.trimStart().length
  const clippedEnd = afterWords.length > CONTEXT_WORDS_EACH_SIDE
  const prefix = clippedStart ? '… ' : ''

  return {
    context: `${prefix}${core}${clippedEnd ? ' …' : ''}`,
    contextMatch: { start: prefix.length + matchIndex - start - leading, length: matchLength },
  }
}

/** True at the start of a cue or straight after sentence-final punctuation. */
function isSentenceInitial(text: string, index: number): boolean {
  const preceding = text.slice(0, index).trimEnd()
  if (preceding.length === 0) return true
  return /[.!?:]$/.test(preceding)
}

interface Accumulator {
  display: string
  kind: 'word' | 'phrase'
  count: number
  cueIdx: number
  startMs: number
  context: string
  contextMatch: ContextMatch
}

/**
 * Pulls study-worthy terms out of a transcript, with the cue each one came from.
 *
 * This does NOT decide the final word list or the CEFR band — it narrows a
 * 20-minute talk down to a set small enough to judge properly, and it carries
 * the cue index and timestamp along so every downstream card can be traced back
 * to the moment it was said. Because the context string is sliced out of the
 * real cue text, a card can never quote a sentence the speaker did not say.
 */
export function extractCandidates(
  cues: readonly Cue[],
  options?: { limit?: number },
): VocabCandidate[] {
  const limit = options?.limit ?? DEFAULT_LIMIT
  const found = new Map<string, Accumulator>()

  // --- Multi-word expressions first, so their parts are not double-counted ---
  const consumed = new Map<number, { start: number; end: number }[]>()

  for (const target of phraseTargets()) {
    let count = 0
    let first: { cue: Cue; index: number; length: number } | null = null

    for (const cue of cues) {
      target.pattern.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = target.pattern.exec(cue.text)) !== null) {
        count += 1
        if (!first) first = { cue, index: match.index, length: match[0].length }

        const ranges = consumed.get(cue.idx) ?? []
        ranges.push({ start: match.index, end: match.index + match[0].length })
        consumed.set(cue.idx, ranges)
      }
    }

    if (!first) continue

    found.set(target.term, {
      // The card teaches the dictionary form, not "kept running into".
      display: target.term,
      kind: 'phrase',
      count,
      cueIdx: first.cue.idx,
      startMs: first.cue.startMs,
      ...contextAround(first.cue.text, first.index, first.length),
    })
  }

  // --- Single words -------------------------------------------------------
  const seenLowercase = new Set<string>()
  const capitalizedMidSentence = new Set<string>()
  const hits = new Map<string, { count: number; cueIdx: number; startMs: number; index: number }>()

  for (const cue of cues) {
    const tokenPattern = /[A-Za-z][A-Za-z'’-]*/g
    let token: RegExpExecArray | null

    while ((token = tokenPattern.exec(cue.text)) !== null) {
      const raw = token[0]

      // "doesn't" would otherwise be sliced at the apostrophe into "doesn".
      // Negative auxiliaries are never flashcard material anyway.
      if (/n['’]t$/i.test(raw)) continue

      const term = normalizeToken(raw)

      if (term.length < MIN_WORD_LENGTH) continue
      if (isAlreadyKnown(term) || CONTRACTION_TAILS.has(term)) continue

      /*
       * Casing is the only proper-noun signal available here, and it only
       * carries information away from the start of a sentence — a capital
       * after a full stop proves nothing. A name that happens to appear ONLY
       * sentence-initially is genuinely ambiguous and survives this filter;
       * the prompt downstream is told to drop names as a second line.
       */
      if (!/^[A-Z]/.test(raw)) seenLowercase.add(term)
      else if (!isSentenceInitial(cue.text, token.index)) capitalizedMidSentence.add(term)

      const hit = hits.get(term)
      if (hit) hit.count += 1
      else hits.set(term, { count: 1, cueIdx: cue.idx, startMs: cue.startMs, index: token.index })
    }
  }

  for (const [term, hit] of hits) {
    if (capitalizedMidSentence.has(term) && !seenLowercase.has(term)) continue

    const cue = cues[hit.cueIdx]
    if (!cue) continue

    // Skip a word already covered by a phrase card — the phrase carries the
    // meaning, and two cards for one idea is noise.
    const ranges = consumed.get(cue.idx) ?? []
    if (ranges.some((range) => hit.index >= range.start && hit.index < range.end)) continue

    found.set(term, {
      display: term,
      kind: 'word',
      count: hit.count,
      cueIdx: hit.cueIdx,
      startMs: hit.startMs,
      ...contextAround(cue.text, hit.index, term.length),
    })
  }

  return [...found.entries()]
    .map(([term, entry]) => ({
      term,
      display: entry.display,
      kind: entry.kind,
      count: entry.count,
      cueIdx: entry.cueIdx,
      startMs: entry.startMs,
      context: entry.context,
      contextMatch: entry.contextMatch,
      academicScore: entry.kind === 'phrase' ? 0 : isAcademicLooking(term),
    }))
    .sort((a, b) => {
      // Phrases are the highest-value group; never let them fall off the end
      // of the list when a talk is dense with repeated single words.
      if (a.kind !== b.kind) return a.kind === 'phrase' ? -1 : 1
      if (b.count !== a.count) return b.count - a.count
      if (b.academicScore !== a.academicScore) return b.academicScore - a.academicScore
      return a.term.localeCompare(b.term)
    })
    .slice(0, limit)
}
