export const VOCAB_GROUP_KEYS = ['common', 'academic', 'phrases'] as const

export type VocabGroupKey = (typeof VOCAB_GROUP_KEYS)[number]

/** One meaning of a term, with an example written to illustrate it. */
export interface VocabSense {
  meaningVi: string
  /** "noun" / "verb" for words; "thành ngữ" / "phrasal verb" for phrases. */
  partOfSpeech: string
  /** One of the term's everyday senses. */
  isCommon: boolean
  /** The sense the speaker actually used. Exactly one per card, always first. */
  inTranscript: boolean
  /**
   * Written by the model to illustrate this sense. Never a quote from the talk —
   * the real line lives in `VocabCard.context` and is shown separately.
   */
  example: { en: string; vi: string }
}

/**
 * One flashcard. `cueIdx`, `startMs` and `context` always come from the
 * transcript itself, never from a language model, so a card can always be
 * traced back to the moment it was said.
 */
export interface VocabCard {
  term: string
  display: string
  /** Empty when unknown or when the term is a multi-word phrase. */
  ipa: string
  /** Part of speech of the in-transcript sense. */
  partOfSpeech: string
  /** Meaning of the in-transcript sense. Empty until a model has supplied it. */
  meaningVi: string
  /** In-transcript sense first. Empty when no model ran. */
  senses: VocabSense[]
  /**
   * True when the model declared the term has only one common sense. The card
   * says so instead of padding with an invented second meaning.
   */
  singleCommonSense: boolean
  context: string
  /** Where the term sits inside `context`, as said — see `VocabCandidate.contextMatch`. */
  contextMatch: { start: number; length: number }
  cueIdx: number
  startMs: number
}

export interface VocabGroup {
  key: VocabGroupKey
  items: VocabCard[]
}

/**
 * Why a deck has no meanings, so the page can say what to do about it. `off`
 * means no model was asked on purpose — the vocabulary page leaves meanings to
 * the learner (2026-10-11).
 */
export type VocabAiIssue = 'no-key' | 'auth' | 'billing' | 'failed' | 'limited' | 'off'

export interface VocabSet {
  groups: VocabGroup[]
  /** Model id that wrote the meanings, or null when none ran. */
  model: string | null
  /** False when only the deterministic extraction ran — no meanings yet. */
  hasMeanings: boolean
  /** Set whenever `hasMeanings` is false. */
  aiIssue?: VocabAiIssue
}
