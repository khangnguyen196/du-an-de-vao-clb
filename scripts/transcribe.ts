/**
 * Makes a transcript with Whisper, on this machine, for a TED talk that TED has
 * not transcribed yet (new talks usually get one days or weeks after release).
 *
 *   npm run transcribe:setup                                  # once: Python env + faster-whisper
 *   npm run transcribe -- <ted-url-or-slug> [--force] [--keep-audio]
 *   npm run transcribe -- <ted-url-or-slug> --compare         # measure against TED's own transcript
 *
 * Fetches only the talk's audio rendition from TED's stream (a few MB) into
 * .cache/transcribe/<slug>/, runs scripts/whisper/transcribe.py on it, deletes
 * the audio, and writes data/transcripts/ted/<slug>.<lang>.json, which the app
 * reads whenever TED's page has no transcript. Free: no API key, no credit.
 *
 * `--compare` runs on a talk that DOES have a TED transcript and saves nothing:
 * it reports the word error rate and how far apart Whisper and TED put the
 * start of each line — the measurement behind trusting these files at all.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeCues } from '@/lib/ingest/normalize'
import { fetchTedTalkInfo, fetchTedTranscript, parseTedSlug } from '@/lib/ingest/ted'
import { readStoredTranscript, streamPathOf, writeStoredTranscript } from '@/lib/ingest/transcript-store'
import { measureAgainstReference, percentile, wordsToSegments } from '@/lib/ingest/whisper'
import { hearTalk, MODEL, whisperInstalled, WORK_ROOT } from './lib/whisper-run'

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function parseArgs(argv: readonly string[]) {
  const [input, ...rest] = argv
  if (!input) fail('usage: npm run transcribe -- <ted-url-or-slug> [--force] [--keep-audio] [--compare]')
  const slug = parseTedSlug(input)
  if (!slug) fail(`"${input}" is not a TED talk link or slug`)
  return {
    slug,
    force: rest.includes('--force'),
    keepAudio: rest.includes('--keep-audio'),
    compare: rest.includes('--compare'),
  }
}

function seconds(ms: number): string {
  return `${ms >= 0 ? '+' : ''}${(ms / 1000).toFixed(2)} s`
}

async function main() {
  const { slug, force, keepAudio, compare } = parseArgs(process.argv.slice(2))
  const talk = await fetchTedTalkInfo(slug)

  if (compare && !talk.hasTranscript) fail('--compare needs a talk TED has already transcribed, to compare against')
  if (!compare && talk.hasTranscript) {
    console.log(`✓ Nothing to do: TED already has a transcript for "${talk.title}". (--compare measures Whisper against it.)`)
    return
  }
  if (!talk.lang.toLowerCase().startsWith('en')) fail(`model ${MODEL} only understands English; this talk is "${talk.lang}"`)
  if (!talk.streamUrl) fail('TED offers no stream for this talk, so there is no audio to transcribe')

  const video = { slug, lang: talk.lang, streamUrl: talk.streamUrl, durationMs: talk.durationMs }
  if (!compare && !force && readStoredTranscript(video)) {
    console.log(`✓ Already transcribed: data/transcripts/ted/${slug}.${talk.lang}.json — pass --force to redo it.`)
    return
  }
  if (!whisperInstalled()) fail('Whisper is not set up yet — run: npm run transcribe:setup')

  const dir = join(WORK_ROOT, slug)
  const output = await hearTalk({ ...talk, streamUrl: talk.streamUrl }, { keepAudio })
  const segments = wordsToSegments(output.words)

  if (compare) {
    const reference = await fetchTedTranscript(slug, { translateTo: null })
    const accuracy = measureAgainstReference(reference.cues, output.words)
    const offsets = accuracy.startOffsetsMs
    const absolute = offsets.map(Math.abs)
    const within = (ms: number) => Math.round((absolute.filter((value) => value <= ms).length / Math.max(1, absolute.length)) * 100)
    const report = {
      slug,
      model: output.model,
      wordErrorRate: accuracy.wordErrorRate,
      referenceWords: accuracy.referenceWords,
      linesMeasured: `${String(accuracy.measuredCues)}/${String(accuracy.totalCues)}`,
      startOffset: {
        median: percentile(offsets, 0.5),
        p10: percentile(offsets, 0.1),
        p90: percentile(offsets, 0.9),
        absP90: percentile(absolute, 0.9),
        absMax: percentile(absolute, 1),
        within500ms: within(500),
        within1s: within(1000),
      },
      whisperLines: normalizeCues(segments).length,
      tedLines: reference.cues.length,
    }
    writeFileSync(join(dir, 'report.json'), `${JSON.stringify({ ...report, startOffsetsMs: offsets }, null, 2)}\n`, 'utf8')

    console.log(`\n"${talk.title}" — Whisper ${output.model} against TED's transcript`)
    console.log(`  word error rate     ${(accuracy.wordErrorRate * 100).toFixed(1)}% of ${String(accuracy.referenceWords)} words`)
    console.log(`  lines measured      ${report.linesMeasured} (first word of the line recognised exactly)`)
    console.log(`  line start, Whisper minus TED (positive = later):`)
    console.log(`    median ${seconds(report.startOffset.median)} · p10 ${seconds(report.startOffset.p10)} · p90 ${seconds(report.startOffset.p90)}`)
    console.log(`    |offset| p90 ${seconds(report.startOffset.absP90)} · max ${seconds(report.startOffset.absMax)}`)
    console.log(`    within 0.5 s: ${String(report.startOffset.within500ms)}% · within 1 s: ${String(report.startOffset.within1s)}%`)
    console.log(`  lines after merging Whisper ${String(report.whisperLines)} · TED ${String(report.tedLines)}`)
    console.log(`  full report: ${join(dir, 'report.json')}`)
    return
  }

  const path = writeStoredTranscript({
    version: 1,
    slug,
    lang: talk.lang,
    streamPath: streamPathOf(talk.streamUrl),
    durationMs: talk.durationMs ?? output.durationMs,
    engine: output.engine,
    engineVersion: output.engineVersion,
    model: output.model,
    segments,
    createdAt: new Date().toISOString(),
  })
  console.log(`✓ Saved ${String(normalizeCues(segments).length)} lines to ${path}`)
  console.log('  The app shows it on the talk page now, labelled as a machine transcript.')
  console.log('  For a Vietnamese line under each one, ask the translator agent to translate this talk.')
}

try {
  await main()
} catch (error) {
  fail((error as Error).message)
}
