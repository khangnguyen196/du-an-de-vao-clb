/**
 * Builds lib/study/dictionary.json — pronunciation and part of speech for
 * single English words, so the vocabulary table can prefill both without a
 * model call.
 *
 *   npm run dict:build -- <path/to/cmudict.dict> <path/to/wordnet/dict> [path/to/cmudict/LICENSE]
 *
 * Sources (downloaded by hand, never committed):
 * - CMUdict, https://github.com/cmusphinx/cmudict — BSD-style licence. American
 *   pronunciations in ARPAbet, converted to IPA here.
 * - Princeton WordNet 3.1, https://wordnet.princeton.edu — WordNet licence.
 *   Gives each word's parts of speech and how often each was seen in tagged
 *   text, so a word that can be several picks the most frequent one.
 *
 * The picked part of speech is the word's most common one, not necessarily the
 * one in the talk; the learner can change it before saving.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type WordNetPos = 'n' | 'v' | 'a' | 'r'

export const POS_LABEL: Record<WordNetPos, string> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' }

// --- ARPAbet → IPA ------------------------------------------------------------

const VOWELS: Record<string, { stressed: string; reduced: string }> = {
  AA: { stressed: 'ɑː', reduced: 'ɑ' },
  AE: { stressed: 'æ', reduced: 'æ' },
  AH: { stressed: 'ʌ', reduced: 'ə' },
  AO: { stressed: 'ɔː', reduced: 'ɔ' },
  AW: { stressed: 'aʊ', reduced: 'aʊ' },
  AY: { stressed: 'aɪ', reduced: 'aɪ' },
  EH: { stressed: 'e', reduced: 'e' },
  ER: { stressed: 'ɝː', reduced: 'ɚ' },
  EY: { stressed: 'eɪ', reduced: 'eɪ' },
  IH: { stressed: 'ɪ', reduced: 'ɪ' },
  IY: { stressed: 'iː', reduced: 'i' },
  OW: { stressed: 'oʊ', reduced: 'oʊ' },
  OY: { stressed: 'ɔɪ', reduced: 'ɔɪ' },
  UH: { stressed: 'ʊ', reduced: 'ʊ' },
  UW: { stressed: 'uː', reduced: 'u' },
}

const CONSONANTS: Record<string, string> = {
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n',
  NG: 'ŋ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
}

/** Consonant clusters English allows at the start of a syllable, for placing stress marks. */
const LEGAL_ONSETS = new Set(
  [
    'P R', 'P L', 'B R', 'B L', 'T R', 'D R', 'K R', 'K L', 'G R', 'G L', 'F R', 'F L', 'TH R', 'SH R',
    'T W', 'D W', 'K W', 'G W', 'S W', 'TH W', 'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S F',
    'S P R', 'S P L', 'S T R', 'S K R', 'S K W', 'S K L', 'P Y', 'B Y', 'K Y', 'F Y', 'M Y', 'V Y', 'HH Y',
  ],
)

function isLegalOnset(consonants: readonly string[]): boolean {
  if (consonants.length === 0) return true
  if (consonants.length === 1) return consonants[0] !== 'NG'
  return LEGAL_ONSETS.has(consonants.join(' '))
}

export function arpabetToIpa(phones: readonly string[]): string | null {
  const parsed = phones.map((phone) => {
    const match = /^([A-Z]+)([012])?$/.exec(phone)
    return { base: match?.[1] ?? '', stress: match?.[2] }
  })
  if (parsed.some(({ base }) => !VOWELS[base] && !CONSONANTS[base])) return null

  const vowelCount = parsed.filter(({ base }) => VOWELS[base]).length
  const out: string[] = parsed.map(({ base, stress }, index) => {
    const vowel = VOWELS[base]
    if (!vowel) return CONSONANTS[base]!
    const final = index === parsed.length - 1
    // "happy" ends in a short, tense i in dictionaries, written /i/.
    if (base === 'IH' && stress === '0' && final) return 'i'
    return stress === '0' ? vowel.reduced : vowel.stressed
  })

  // Stress marks go before the syllable, which starts with the longest legal
  // onset in front of its vowel. One-syllable words carry no mark, as in print.
  if (vowelCount > 1) {
    const marks = new Map<number, string>()
    parsed.forEach(({ base, stress }, index) => {
      if (!VOWELS[base] || (stress !== '1' && stress !== '2')) return
      let start = index
      while (start > 0 && !VOWELS[parsed[start - 1]!.base]) {
        const cluster = parsed.slice(start - 1, index).map((phone) => phone.base)
        if (!isLegalOnset(cluster)) break
        start -= 1
      }
      marks.set(start, stress === '1' ? 'ˈ' : 'ˌ')
    })
    for (const [index, mark] of [...marks].sort((a, b) => b[0] - a[0])) out.splice(index, 0, mark)
  }

  return `/${out.join('')}/`
}

// --- WordNet ------------------------------------------------------------------

interface PosCount {
  /** Times seen in sense-tagged text. */
  tagged: number
  senses: number
}

function readIndex(dir: string, pos: WordNetPos, file: string): Map<string, PosCount> {
  const entries = new Map<string, PosCount>()
  for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const tokens = line.trim().split(/\s+/)
    const lemma = tokens[0]!
    if (tokens[1] !== pos) continue
    const pointerCount = Number(tokens[3])
    const senses = Number(tokens[4 + pointerCount])
    const tagged = Number(tokens[5 + pointerCount])
    if (Number.isFinite(senses) && Number.isFinite(tagged)) entries.set(lemma, { tagged, senses })
  }
  return entries
}

/** The licence WordNet prints at the top of every index file, which must travel with any copy. */
function readWordNetLicence(dir: string): string {
  return readFileSync(join(dir, 'index.noun'), 'utf8')
    .split('\n')
    .filter((line) => /^ {2}\d+ /.test(line))
    .map((line) => line.replace(/^ {2}\d+ ?/, '').trimEnd())
    .join('\n')
    .trim()
}

function readExceptions(dir: string, file: string): Map<string, string[]> {
  const entries = new Map<string, string[]>()
  for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
    const [inflected, ...bases] = line.trim().split(/\s+/)
    if (inflected && bases.length > 0) entries.set(inflected, bases)
  }
  return entries
}

/** WordNet's own detachment rules (morphy), plus undoubling for "running" → "run". */
const DETACH: Record<WordNetPos, readonly [string, string][]> = {
  n: [['s', ''], ['ses', 's'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'], ['ies', 'y']],
  v: [['s', ''], ['ies', 'y'], ['es', 'e'], ['es', ''], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', '']],
  a: [['er', ''], ['est', ''], ['er', 'e'], ['est', 'e']],
  r: [],
}

function baseForms(word: string, pos: WordNetPos, exceptions: Map<string, string[]>): string[] {
  const forms = new Set<string>(exceptions.get(word) ?? [])
  for (const [suffix, replacement] of DETACH[pos]) {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 1) continue
    const base = word.slice(0, -suffix.length) + replacement
    forms.add(base)
    if (replacement === '' && /([b-df-hj-np-tv-z])\1$/.test(base)) forms.add(base.slice(0, -1))
  }
  return [...forms]
}

// --- build --------------------------------------------------------------------

function main() {
  const [cmuPath, wordnetDir, cmuLicensePath] = process.argv.slice(2)
  if (!cmuPath || !wordnetDir) {
    console.error('usage: build-dictionary.ts <cmudict.dict> <wordnet/dict> [cmudict LICENSE]')
    process.exit(1)
  }

  const files: Record<WordNetPos, [string, string]> = {
    n: ['index.noun', 'noun.exc'],
    v: ['index.verb', 'verb.exc'],
    a: ['index.adj', 'adj.exc'],
    r: ['index.adv', 'adv.exc'],
  }
  const wordnet = (Object.keys(files) as WordNetPos[]).map((pos) => ({
    pos,
    index: readIndex(wordnetDir, pos, files[pos][0]),
    exceptions: readExceptions(wordnetDir, files[pos][1]),
  }))

  /**
   * A word that is itself a WordNet entry is scored on its own counts; a form
   * that only reaches an entry through an inflection rule ("studies" → study)
   * is scored on the base, at a discount so "interested" stays an adjective
   * instead of becoming the verb "interest".
   */
  function pickPos(word: string): WordNetPos | null {
    let best: { pos: WordNetPos; score: number } | null = null
    for (const { pos, index, exceptions } of wordnet) {
      const direct = index.get(word)
      let score = direct ? 2 * direct.tagged + direct.senses / 100 + 1 : -1
      for (const base of baseForms(word, pos, exceptions)) {
        const entry = index.get(base)
        if (entry) score = Math.max(score, entry.tagged + entry.senses / 100 + 0.5)
      }
      if (score >= 0 && (!best || score > best.score)) best = { pos, score }
    }
    return best?.pos ?? null
  }

  /*
   * Only words the vocabulary list can actually show: four letters or more
   * (the extractor's own minimum), no apostrophes (it cuts words there), and
   * known to WordNet. The rest of CMUdict is mostly names, which are not
   * vocabulary and would double the file for nothing.
   */
  const words: Record<string, string> = {}
  for (const line of readFileSync(cmuPath, 'utf8').split('\n')) {
    // Alternate pronunciations are listed as "word(2)"; keep the first only.
    const match = /^([a-z][a-z-]*[a-z]) ([A-Z0-9 ]+?)(?:\s+#.*)?$/.exec(line.trim())
    if (!match) continue
    const [, word, phones] = match
    if (!word || !phones || word.length < 4 || words[word] !== undefined) continue

    const pos = pickPos(word)
    const ipa = pos ? arpabetToIpa(phones.split(' ')) : null
    if (pos && ipa) words[word] = `${ipa}|${pos}`
  }

  const cmuLicense = cmuLicensePath ? readFileSync(cmuLicensePath, 'utf8').trim() : null
  const output = {
    // One string, not an object keyed by word: TypeScript infers a type for
    // every key of an imported JSON object, and 50k keys would stall typecheck.
    format: 'entries: one "word<TAB>ipa<TAB>pos" per line; pos is n (noun), v (verb), a (adjective), r (adverb)',
    sources: [
      {
        name: 'CMU Pronouncing Dictionary',
        url: 'https://github.com/cmusphinx/cmudict',
        notice: cmuLicense ?? 'Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved. BSD-style licence.',
      },
      {
        name: 'Princeton WordNet 3.1',
        url: 'https://wordnet.princeton.edu/license-and-commercial-use',
        notice: readWordNetLicence(wordnetDir),
      },
    ],
    entries: Object.entries(words)
      .map(([word, value]) => `${word}\t${value.replace('|', '\t')}`)
      .join('\n'),
  }

  const target = join(process.cwd(), 'lib', 'study', 'dictionary.json')
  writeFileSync(target, `${JSON.stringify(output)}\n`, 'utf8')
  console.log(`✓ ${Object.keys(words).length} words → ${target}`)
}

if (process.argv[1]?.endsWith('build-dictionary.ts')) main()
