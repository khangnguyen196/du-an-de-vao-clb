import { cache } from 'react'
import { describeErrorCause, isAuthError, isBillingError } from '@/lib/ai/structured'
import { generateVocabSet, hasAnthropicKey } from '@/lib/ai/vocabulary'
import { extractCandidates, type VocabCandidate } from '@/lib/study/candidates'
import type { VocabAiIssue, VocabCard, VocabSet } from '@/types/study'
import type { Transcript } from '@/types/transcript'

/** Roughly 20 cards per group, so ask the model to choose from a wider pool. */
const CANDIDATE_LIMIT = 120
/** Kept small in the no-model path — an unranked wall of words helps nobody. */
const FALLBACK_WORD_LIMIT = 40
const FALLBACK_PHRASE_LIMIT = 25

function toBareCard(candidate: VocabCandidate): VocabCard {
  return {
    term: candidate.term,
    display: candidate.display,
    ipa: '',
    partOfSpeech: candidate.kind === 'phrase' ? 'cụm từ' : '',
    // No meaning is written here on purpose. Inventing one to fill the card
    // would be worse than an obviously empty back.
    meaningVi: '',
    senses: [],
    singleCommonSense: false,
    context: candidate.context,
    contextMatch: candidate.contextMatch,
    cueIdx: candidate.cueIdx,
    startMs: candidate.startMs,
  }
}

/**
 * What the page can show with no model available: the extraction is real, the
 * phrase group is real, but the single words are NOT split into CEFR bands.
 * That split needs judgement, and a suffix heuristic dressed up as "B1-B2 vs
 * C1+" would be a confident lie. The `academic` group stays empty and the UI
 * labels the word group as ungraded.
 */
function fallbackSet(candidates: readonly VocabCandidate[], aiIssue: VocabAiIssue): VocabSet {
  const phrases = candidates.filter((candidate) => candidate.kind === 'phrase')
  const words = candidates.filter((candidate) => candidate.kind === 'word')

  return {
    groups: [
      { key: 'common', items: words.slice(0, FALLBACK_WORD_LIMIT).map(toBareCard) },
      { key: 'academic', items: [] },
      { key: 'phrases', items: phrases.slice(0, FALLBACK_PHRASE_LIMIT).map(toBareCard) },
    ],
    model: null,
    hasMeanings: false,
    aiIssue,
  }
}

/**
 * Builds the vocabulary set for a transcript.
 *
 * Deduped per render pass. This is NOT cached across requests: a model call
 * costs money, so the result belongs in the `cards` table once M4 has a DB
 * rather than in a memory map that a second instance cannot see.
 */
export const buildVocabSet = cache(
  async (
    transcript: Transcript,
    options: {
      /** Asked right before the model would be called; false falls back without spending anything. */
      allowModel?: () => boolean
    } = {},
  ): Promise<VocabSet> => {
    const candidates = extractCandidates(transcript.cues, { limit: CANDIDATE_LIMIT })

    if (!hasAnthropicKey()) return fallbackSet(candidates, 'no-key')
    if (options.allowModel && !options.allowModel()) return fallbackSet(candidates, 'limited')

    /*
     * A model failure must never take the page down. The extraction and the
     * quoted lines are real without a model, so the learner still gets a deck,
     * and the page says why the backs are empty.
     */
    try {
      return await generateVocabSet({
        title: transcript.source.title,
        ...(transcript.source.author ? { author: transcript.source.author } : {}),
        candidates,
      })
    } catch (error) {
      const issue: VocabAiIssue = isAuthError(error) ? 'auth' : isBillingError(error) ? 'billing' : 'failed'
      const cause = describeErrorCause(error)
      // No credit is an account state the page already explains, not a fault to
      // flag on every view. A rejected key or a broken answer still logs as error.
      const log = issue === 'billing' ? console.warn : console.error
      log(
        `[vocab] model unavailable for "${transcript.source.title}" (${issue}):`,
        (error as Error).message,
        ...(cause ? [`— cause: ${cause}`] : []),
      )
      return fallbackSet(candidates, issue)
    }
  },
)
