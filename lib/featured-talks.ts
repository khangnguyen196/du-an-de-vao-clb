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

/** One line of the landing page's preview, quoted from a real talk. */
export interface ExcerptLine {
  startMs: number
  en: string
  /** The TED community's Vietnamese translation of the line. */
  vi: string
}

/**
 * Three consecutive lines of Matt Cutts's sample talk, shown in the landing
 * page's watch-screen preview next to TED's own photo of that talk.
 *
 * Quoted verbatim, times included, from TED's transcript and its Vietnamese
 * translation as fetched on 2026-10-11 (cues 3–5 after `normalizeCues`). A
 * real speaker's photo must sit next to words that speaker actually said —
 * which is why these are not paraphrased or invented. CC BY-NC-ND: unaltered,
 * credited under the preview, on a site that sells nothing.
 */
export const PREVIEW_EXCERPT = {
  // By slug, not position: reordering the samples must never put these words
  // under somebody else's photo.
  talk: FEATURED_TALKS.find((talk) => talk.slug === 'matt_cutts_try_something_new_for_30_days')!,
  /** The line lit when motion is reduced; the player shows its time. */
  restingIndex: 1,
  lines: [
    {
      startMs: 31_000,
      en: "There's a few things I learned while doing these 30-day challenges.",
      vi: 'Tôi đã học được một số điều trong khi thực hiện thử thách 30 ngày đó.',
    },
    {
      startMs: 34_622,
      en: 'The first was, instead of the months flying by, forgotten, the time was much more memorable.',
      vi: 'Điều đầu tiên là, thay vì có những tháng trôi qua dần bị lãng quên, thì thời gian trở nên đáng nhớ hơn nhiều.',
    },
    {
      startMs: 42_000,
      en: 'This was part of a challenge I did to take a picture every day for a month.',
      vi: 'Đây là một ví dụ trong thử thách chụp mỗi ngày một bức ảnh trong một tháng.',
    },
  ] satisfies ExcerptLine[],
} as const
