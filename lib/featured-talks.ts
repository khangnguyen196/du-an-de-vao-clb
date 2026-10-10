/**
 * Sample talks on the landing page and in the sitemap.
 *
 * Picked by hand, not pulled from TED's catalogue: each one was checked on
 * 2026-10-10 to have a Vietnamese translation by the TED community and an HLS
 * stream, so a first-time visitor gets the full experience. Titles and speakers
 * are TED's own metadata. Shortest first — an easier start for a learner.
 */
export interface FeaturedTalk {
  slug: string
  title: string
  speaker: string
  durationMs: number
}

export const FEATURED_TALKS: readonly FeaturedTalk[] = [
  { slug: 'matt_cutts_try_something_new_for_30_days', title: 'Try something new for 30 days', speaker: 'Matt Cutts', durationMs: 190_000 },
  {
    slug: 'angela_lee_duckworth_grit_the_power_of_passion_and_perseverance',
    title: 'Grit: The power of passion and perseverance',
    speaker: 'Angela Lee Duckworth',
    durationMs: 359_000,
  },
  {
    slug: 'julian_treasure_how_to_speak_so_that_people_want_to_listen',
    title: 'How to speak so that people want to listen',
    speaker: 'Julian Treasure',
    durationMs: 584_000,
  },
  {
    slug: 'robert_waldinger_what_makes_a_good_life_lessons_from_the_longest_study_on_happiness',
    title: 'What makes a good life? Lessons from the longest study on happiness',
    speaker: 'Robert Waldinger',
    durationMs: 757_000,
  },
  {
    slug: 'tim_urban_inside_the_mind_of_a_master_procrastinator',
    title: 'Inside the mind of a master procrastinator',
    speaker: 'Tim Urban',
    durationMs: 834_000,
  },
  { slug: 'kelly_mcgonigal_how_to_make_stress_your_friend', title: 'How to make stress your friend', speaker: 'Kelly McGonigal', durationMs: 855_000 },
  { slug: 'simon_sinek_how_great_leaders_inspire_action', title: 'How great leaders inspire action', speaker: 'Simon Sinek', durationMs: 1_067_000 },
  { slug: 'brene_brown_the_power_of_vulnerability', title: 'The power of vulnerability', speaker: 'Brené Brown', durationMs: 1_202_000 },
]
