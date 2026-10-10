/**
 * Sample talks on the landing page and in the sitemap.
 *
 * Picked by hand, not pulled from TED's catalogue: each one was checked on
 * 2026-10-10 to have a Vietnamese translation by the TED community and an HLS
 * stream, so a first-time visitor gets the full experience. Titles and speakers
 * are TED's own metadata. Shortest first — an easier start for a learner.
 *
 * `image` is TED's own 16:9 photo of the talk (`primaryImageSet`, "16x9"),
 * served from TED's image CDN and resized by next/image. It is TED's, under
 * the talk's CC BY-NC-ND licence: shown unaltered with credit, on a site that
 * sells nothing. Never crop it into something new or put it behind a paywall.
 */
export interface FeaturedTalk {
  slug: string
  title: string
  speaker: string
  durationMs: number
  image: string
}

const TED_PHOTOS = 'https://pi.tedcdn.com/r/talkstar-photos.s3.amazonaws.com/uploads'

export const FEATURED_TALKS: readonly FeaturedTalk[] = [
  {
    slug: 'matt_cutts_try_something_new_for_30_days',
    title: 'Try something new for 30 days',
    speaker: 'Matt Cutts',
    durationMs: 190_000,
    image: `${TED_PHOTOS}/424e6719-7627-40bc-ae35-1ed70a66ed2a/MattCutts_2011U-embed.jpg`,
  },
  {
    slug: 'angela_lee_duckworth_grit_the_power_of_passion_and_perseverance',
    title: 'Grit: The power of passion and perseverance',
    speaker: 'Angela Lee Duckworth',
    durationMs: 359_000,
    image: `${TED_PHOTOS}/49490c34-ef8e-45b1-8037-a4958efc2609/AngelaDuckworth_2013S-embed.jpg`,
  },
  {
    slug: 'julian_treasure_how_to_speak_so_that_people_want_to_listen',
    title: 'How to speak so that people want to listen',
    speaker: 'Julian Treasure',
    durationMs: 584_000,
    image: `${TED_PHOTOS}/46964e3c-1231-42b7-9288-671ff9fdde2e/JulianTreasure_2013U-embed.jpg`,
  },
  {
    slug: 'robert_waldinger_what_makes_a_good_life_lessons_from_the_longest_study_on_happiness',
    title: 'What makes a good life? Lessons from the longest study on happiness',
    speaker: 'Robert Waldinger',
    durationMs: 757_000,
    image: `${TED_PHOTOS}/1dc3550a-4ff0-44cf-9be6-2aa6ef9c43dd/RobertWaldinger_2015X-embed.jpg`,
  },
  {
    slug: 'tim_urban_inside_the_mind_of_a_master_procrastinator',
    title: 'Inside the mind of a master procrastinator',
    speaker: 'Tim Urban',
    durationMs: 834_000,
    image: `${TED_PHOTOS}/d5d00454-d7aa-434c-8fae-ff2bc97c5f02/TimUrban_2016-embed.jpg`,
  },
  {
    slug: 'kelly_mcgonigal_how_to_make_stress_your_friend',
    title: 'How to make stress your friend',
    speaker: 'Kelly McGonigal',
    durationMs: 855_000,
    image: `${TED_PHOTOS}/4ebfc94d-c426-4019-9060-20edc54dcec8/KellyMcGonigal_2013G-embed.jpg`,
  },
  {
    slug: 'simon_sinek_how_great_leaders_inspire_action',
    title: 'How great leaders inspire action',
    speaker: 'Simon Sinek',
    durationMs: 1_067_000,
    image: 'https://pe.tedcdn.com/images/ted/04916ee6e81065c8333e6546184af512eee37bbe_2880x1620.jpg',
  },
  {
    slug: 'brene_brown_the_power_of_vulnerability',
    title: 'The power of vulnerability',
    speaker: 'Brené Brown',
    durationMs: 1_202_000,
    image: `${TED_PHOTOS}/9595cdc1-fd8e-4aa1-863a-2c6641ae3cbb/BreneBrown_2010X-embed.jpg`,
  },
]
