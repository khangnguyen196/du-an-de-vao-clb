/**
 * Word timings for a TED talk, so its playing line lights up word by word.
 *
 *   npm run align -- <ted-url-or-slug> [--force] [--rerun] [--keep-audio]
 *
 * Runs local Whisper on the talk's audio (or reuses an earlier run of the same
 * model for the same talk, unless --rerun), lines Whisper's words up against
 * TED's own transcript, and writes data/word-timings/ted/<slug>.<lang>.json:
 * for every word of TED's text, when it starts. TED's words are what show on
 * screen; Whisper only lends the times.
 */
import { MIN_MATCHED_SHARE, applyStoredWordTimings, toStoredMarks, writeStoredWordTimings } from '@/lib/ingest/word-timing-store'
import { fetchTedTalkInfo, fetchTedTranscript, parseTedSlug } from '@/lib/ingest/ted'
import { readStoredTranscript } from '@/lib/ingest/transcript-store'
import { fingerprintCues } from '@/lib/ingest/translation-store'
import { percentile } from '@/lib/ingest/whisper'
import { buildWordMarks } from '@/lib/ingest/word-align'
import { hearTalk, MODEL } from './lib/whisper-run'

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function parseArgs(argv: readonly string[]) {
  const [input, ...rest] = argv
  if (!input) fail('usage: npm run align -- <ted-url-or-slug> [--force] [--rerun] [--keep-audio]')
  const slug = parseTedSlug(input)
  if (!slug) fail(`"${input}" is not a TED talk link or slug`)
  return { slug, force: rest.includes('--force'), rerun: rest.includes('--rerun'), keepAudio: rest.includes('--keep-audio') }
}

async function main() {
  const { slug, force, rerun, keepAudio } = parseArgs(process.argv.slice(2))

  const talk = await fetchTedTalkInfo(slug)
  if (!talk.lang.toLowerCase().startsWith('en')) fail(`model ${MODEL} only understands English; this talk is "${talk.lang}"`)
  if (!talk.streamUrl) fail('TED offers no stream for this talk, so there is no audio to align')

  // The exact cues the app shows: TED's transcript, or the Whisper file for a
  // talk TED has not transcribed.
  const transcript = await fetchTedTranscript(slug, {
    translateTo: null,
    storedTranscript: (video) => readStoredTranscript(video),
  })
  const { cues } = transcript

  if (!force && applyStoredWordTimings(slug, transcript.lang, cues)) {
    console.log(`✓ Already aligned: data/word-timings/ted/${slug}.${transcript.lang}.json — pass --force to redo it.`)
    return
  }

  const heard = await hearTalk({ ...talk, streamUrl: talk.streamUrl }, { keepAudio, reuseCached: !rerun })
  const result = buildWordMarks(cues, heard.words)

  if (result.matchedShare < MIN_MATCHED_SHARE) {
    fail(
      `only ${(result.matchedShare * 100).toFixed(0)}% of the transcript's words were heard — not saving. ` +
        'Wrong audio, or a transcript that differs a lot from the talk.',
    )
  }

  // How far each line's first word sits from the line start TED gives: a
  // sanity check that audio and transcript share one clock.
  const lineOffsets = cues.flatMap((cue, index) => {
    const first = result.marks[index]?.[0]
    return first ? [first.startMs - cue.startMs] : []
  })

  const path = writeStoredWordTimings({
    version: 1,
    slug,
    lang: transcript.lang,
    fingerprint: fingerprintCues(cues),
    cueCount: cues.length,
    engine: heard.engine,
    model: heard.model,
    matchedShare: Number(result.matchedShare.toFixed(4)),
    wordCount: result.wordCount,
    cues: toStoredMarks(result.marks),
    createdAt: new Date().toISOString(),
  })

  console.log(`✓ Saved word timings for "${talk.title}" to ${path}`)
  console.log(`  ${String(result.wordCount)} words, ${(result.matchedShare * 100).toFixed(1)}% heard exactly (the rest timed between their neighbours)`)
  console.log(
    `  first word vs TED line start: median ${(percentile(lineOffsets, 0.5) / 1000).toFixed(2)} s, ` +
      `|p90| ${(percentile(lineOffsets.map(Math.abs), 0.9) / 1000).toFixed(2)} s`,
  )
}

try {
  await main()
} catch (error) {
  fail((error as Error).message)
}
