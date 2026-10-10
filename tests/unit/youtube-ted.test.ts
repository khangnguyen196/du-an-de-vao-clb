import { describe, expect, it, vi } from 'vitest'
import { AppError, ERROR_CODES } from '@/lib/errors'
import {
  channelKind,
  findTedTalkForYouTube,
  MAX_SLUG_CANDIDATES,
  slugCandidates,
  tedSearchQuery,
  toSlugPart,
} from '@/lib/ingest/youtube-ted'

/** YouTube oEmbed titles and the ted.com slugs they belong to, measured 2026-10-11. */
const MEASURED: [title: string, slug: string][] = [
  ['The Power of Vulnerability | Brené Brown | TED', 'brene_brown_the_power_of_vulnerability'],
  [
    'Grit: The Power of Passion and Perseverance | Angela Lee Duckworth | TED',
    'angela_lee_duckworth_grit_the_power_of_passion_and_perseverance',
  ],
  [
    'How to Clean Up the World’s Dirtiest Industry | Joojin Kim | TED',
    'joojin_kim_how_to_clean_up_the_world_s_dirtiest_industry',
  ],
  ['How to Use Tech to Outsmart Dictators | Leopoldo López | TED', 'leopoldo_lopez_how_to_use_tech_to_outsmart_dictators'],
  ['Try something new for 30 days | Matt Cutts', 'matt_cutts_try_something_new_for_30_days'],
  [
    'What Makes a Good Life? Lessons from the Longest Study on Happiness | Robert Waldinger | TED',
    'robert_waldinger_what_makes_a_good_life_lessons_from_the_longest_study_on_happiness',
  ],
  [
    'Why the Future is Human — Plus AI | Esther Perel and Sal Khan',
    'sal_khan_and_esther_perel_why_the_future_is_human_plus_ai',
  ],
  ['Do schools kill creativity? | Sir Ken Robinson | TED', 'sir_ken_robinson_do_schools_kill_creativity'],
]

describe('slugCandidates', () => {
  it.each(MEASURED)('finds the slug for "%s"', (title, slug) => {
    expect(slugCandidates(title)).toContain(slug)
  })

  it('reads the oldest "Speaker: Title" shape', () => {
    expect(slugCandidates('Simon Sinek: How great leaders inspire action')).toEqual([
      'simon_sinek_how_great_leaders_inspire_action',
    ])
  })

  it('drops the channel suffix, TEDx included', () => {
    expect(slugCandidates('Why we sleep | Jane Doe | TEDxBoston')).toEqual(['jane_doe_why_we_sleep'])
  })

  it('cannot recover a title YouTube rewrote', () => {
    // ted.com slug: ari_matusiak_how_to_make_ai_companies_pay_your_energy_bill
    expect(
      slugCandidates('The Energy Mess AI Is Creating — and How to Fix It | Ari Matusiak | TED'),
    ).not.toContain('ari_matusiak_how_to_make_ai_companies_pay_your_energy_bill')
  })

  it('never offers more than the cap, and nothing for a bare title', () => {
    expect(slugCandidates('A | B and C | D and E').length).toBeLessThanOrEqual(MAX_SLUG_CANDIDATES)
    expect(slugCandidates('Just a title')).toEqual([])
  })
})

describe('helpers', () => {
  it('spells slug parts the way TED does', () => {
    expect(toSlugPart('Brené Brown')).toBe('brene_brown')
    expect(toSlugPart('Why I’m building libraries')).toBe('why_i_m_building_libraries')
  })

  it('sorts channels into TED, TEDx and the rest', () => {
    expect(channelKind('TED')).toBe('ted')
    expect(channelKind('TED-Ed')).toBe('ted')
    expect(channelKind('TEDx Talks')).toBe('tedx')
    expect(channelKind('Rick Astley')).toBe('other')
    expect(channelKind('Tedious Reviews')).toBe('other')
  })

  it('builds a TED search from title and speaker', () => {
    expect(tedSearchQuery('The Power of Vulnerability | Brené Brown | TED')).toBe(
      'The Power of Vulnerability Brené Brown',
    )
  })
})

describe('findTedTalkForYouTube', () => {
  const brene = { title: 'The Power of Vulnerability | Brené Brown | TED', channel: 'TED' }

  it('accepts a candidate only when TED lists the same video id', async () => {
    const result = await findTedTalkForYouTube('iCvmsMzlF7o', {
      videoInfo: async () => brene,
      tedYouTubeCode: async () => 'iCvmsMzlF7o',
    })
    expect(result).toEqual({ status: 'found', slug: 'brene_brown_the_power_of_vulnerability' })
  })

  it('rejects a talk that exists but lists a different video', async () => {
    const result = await findTedTalkForYouTube('AAAAAAAAAA1', {
      videoInfo: async () => brene,
      tedYouTubeCode: async () => 'iCvmsMzlF7o',
    })
    expect(result).toMatchObject({ status: 'not-found', kind: 'ted' })
  })

  it('treats a slug TED does not have as a miss and tries the next', async () => {
    const tedYouTubeCode = vi.fn(async (slug: string) => {
      if (slug === 'esther_perel_and_sal_khan_why_the_future_is_human_plus_ai') {
        throw new AppError(ERROR_CODES.VIDEO_UNAVAILABLE, 'no such talk')
      }
      return 'Xyz123abc_-'
    })
    const result = await findTedTalkForYouTube('Xyz123abc_-', {
      videoInfo: async () => ({ title: 'Why the Future is Human — Plus AI | Esther Perel and Sal Khan', channel: 'TED' }),
      tedYouTubeCode,
    })
    expect(result).toEqual({ status: 'found', slug: 'sal_khan_and_esther_perel_why_the_future_is_human_plus_ai' })
    expect(tedYouTubeCode).toHaveBeenCalledTimes(2)
  })

  it('passes on a TED failure instead of calling it "not found"', async () => {
    await expect(
      findTedTalkForYouTube('iCvmsMzlF7o', {
        videoInfo: async () => brene,
        tedYouTubeCode: async () => {
          throw new AppError(ERROR_CODES.UPSTREAM_BLOCKED, 'TED refused')
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.UPSTREAM_BLOCKED })
  })

  it('spends no TED request on a video from outside the TED family', async () => {
    const tedYouTubeCode = vi.fn(async () => null)
    const result = await findTedTalkForYouTube('dQw4w9WgXcQ', {
      videoInfo: async () => ({ title: 'Never Gonna Give You Up | Rick Astley', channel: 'Rick Astley' }),
      tedYouTubeCode,
    })
    expect(result).toMatchObject({ status: 'not-found', kind: 'other' })
    expect(tedYouTubeCode).not.toHaveBeenCalled()
  })

  it('reports a video YouTube does not show publicly', async () => {
    const result = await findTedTalkForYouTube('UNTZMlgf2To', { videoInfo: async () => null })
    expect(result).toEqual({ status: 'unavailable' })
  })
})
