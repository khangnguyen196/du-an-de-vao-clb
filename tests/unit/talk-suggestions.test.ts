import { describe, expect, it } from 'vitest'
import { FEATURED_TALKS } from '@/lib/featured-talks'
import type { RecentTalk } from '@/lib/recent-talks'
import { buildSuggestions } from '@/lib/talk-suggestions'

const recent: RecentTalk[] = [
  {
    slug: 'blake_mycoskie_the_three_words_that_saved_my_life',
    title: 'The three words that saved my life',
    speaker: 'Blake Mycoskie',
    openedAt: '2026-10-11T00:00:00.000Z',
  },
  {
    slug: 'brene_brown_the_power_of_vulnerability',
    title: 'The power of vulnerability',
    speaker: 'Brené Brown',
    openedAt: '2026-10-10T00:00:00.000Z',
  },
]

describe('buildSuggestions', () => {
  it('lists recent talks first, then samples, each talk once', () => {
    const list = buildSuggestions('', recent, FEATURED_TALKS, 20)
    expect(list.slice(0, 2).map((s) => s.kind)).toEqual(['recent', 'recent'])
    expect(list.filter((s) => s.slug === 'brene_brown_the_power_of_vulnerability')).toHaveLength(1)
    expect(list).toHaveLength(FEATURED_TALKS.length + 1)
  })

  it('keeps the sample photo on a sample the reader already opened', () => {
    const brene = buildSuggestions('', recent).find((s) => s.slug === 'brene_brown_the_power_of_vulnerability')
    expect(brene?.kind).toBe('recent')
    expect(brene?.image).toMatch(/^https:\/\/pi\.tedcdn\.com\//)
  })

  it('matches title and speaker words, ignoring case and diacritics', () => {
    expect(buildSuggestions('brene', [], FEATURED_TALKS).map((s) => s.speaker)).toEqual(['Brené Brown'])
    expect(buildSuggestions('LEADERS inspire', [], FEATURED_TALKS).map((s) => s.speaker)).toEqual(['Simon Sinek'])
    expect(buildSuggestions('no such talk', [], FEATURED_TALKS)).toEqual([])
  })

  it('matches a pasted link to its talk', () => {
    const list = buildSuggestions('https://www.ted.com/talks/tim_urban_inside_the_mind_of_a_master_procrastinator', [], FEATURED_TALKS)
    expect(list.map((s) => s.slug)).toEqual(['tim_urban_inside_the_mind_of_a_master_procrastinator'])
  })

  it('caps the list', () => {
    expect(buildSuggestions('', recent, FEATURED_TALKS, 3)).toHaveLength(3)
  })
})
