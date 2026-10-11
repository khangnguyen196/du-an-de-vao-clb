import { describe, expect, it } from 'vitest'
import { arpabetToIpa } from '@/scripts/build-dictionary'
import { lookupWord } from '@/lib/study/dictionary'

describe('arpabetToIpa', () => {
  it('marks primary stress before the syllable, taking the longest legal onset', () => {
    expect(arpabetToIpa(['R', 'IH0', 'Z', 'IH1', 'L', 'Y', 'AH0', 'N', 'T'])).toBe('/rɪˈzɪljənt/')
    // "st" can start a syllable, so the mark goes before both.
    expect(arpabetToIpa(['D', 'IH0', 'S', 'T', 'IH1', 'NG', 'K', 'T', 'IH0', 'V'])).toBe('/dɪˈstɪŋktɪv/')
  })

  it('leaves one-syllable words unmarked, as dictionaries print them', () => {
    expect(arpabetToIpa(['S', 'P', 'AW1', 'S'])).toBe('/spaʊs/')
  })

  it('writes a reduced vowel as schwa and a final unstressed IH as i', () => {
    expect(arpabetToIpa(['HH', 'AE1', 'P', 'IY0'])).toBe('/ˈhæpi/')
    expect(arpabetToIpa(['AH0', 'B', 'AW1', 'T'])).toBe('/əˈbaʊt/')
  })

  it('refuses phones it does not know rather than guessing', () => {
    expect(arpabetToIpa(['XX1'])).toBeNull()
  })
})

describe('lookupWord', () => {
  it('returns IPA and the most frequent part of speech', () => {
    expect(lookupWord('resilient')).toEqual({ ipa: '/rɪˈzɪljənt/', partOfSpeech: 'adjective' })
    expect(lookupWord('studies')?.partOfSpeech).toBe('noun')
  })

  it('reaches inflected forms through their base', () => {
    expect(lookupWord('running')?.partOfSpeech).toBe('verb')
  })

  it('ignores case and surrounding spaces', () => {
    expect(lookupWord('  Resilient ')).toEqual(lookupWord('resilient'))
  })

  it('returns null for words it does not have', () => {
    expect(lookupWord('lovemotif')).toBeNull()
  })
})
