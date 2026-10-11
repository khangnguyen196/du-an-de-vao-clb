import data from '@/lib/study/dictionary.json'

/**
 * Pronunciation and part of speech for single English words, from CMUdict and
 * Princeton WordNet (built by scripts/build-dictionary.ts; licences ride along
 * inside the JSON). Server-only in practice: the file is ~1.6 MB and only the
 * vocabulary page's server code reads it.
 *
 * The part of speech is the word's most frequent one in WordNet's tagged text,
 * not necessarily the one the speaker used — the learner can change it.
 */

const POS: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' }

export interface DictionaryEntry {
  /** American IPA in slashes, e.g. /rɪˈzɪljənt/. */
  ipa: string
  /** noun, verb, adjective or adverb — the labels the model uses too. */
  partOfSpeech: string
}

let index: Map<string, DictionaryEntry> | null = null

/** Parsed on first use, once per server instance. */
function load(): Map<string, DictionaryEntry> {
  if (index) return index
  index = new Map()
  for (const line of data.entries.split('\n')) {
    const [word, ipa, pos] = line.split('\t')
    const partOfSpeech = pos ? POS[pos] : undefined
    if (word && ipa && partOfSpeech) index.set(word, { ipa, partOfSpeech })
  }
  return index
}

export function lookupWord(term: string): DictionaryEntry | null {
  return load().get(term.trim().toLowerCase()) ?? null
}
