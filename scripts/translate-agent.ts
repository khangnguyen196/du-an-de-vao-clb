/**
 * Tooling for the Claude Code `translator` subagent (.claude/agents/translator.md).
 *
 * The subagent translates a TED talk itself — no API key, no API credit — and
 * this script is the part that must not be left to judgement: fetching the
 * exact cues the app will show, cutting them into the same batches the API
 * path uses, and checking every answer before it is stored.
 *
 *   npm run translate:prepare -- <ted-url-or-slug> [--lang en] [--force]
 *   npm run translate:save -- <ted-url-or-slug> [--lang en]
 *
 * `prepare` writes one prompt file per batch into .cache/translate/<slug>.<lang>/.
 * The agent answers each `batch-NNN.prompt.txt` with a `batch-NNN.json` next to
 * it. `save` validates those answers and writes the translation the app reads.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { buildTranslationUserPrompt, TRANSLATION_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { buildTranslationBatches, mergeTranslations, TranslationWireSchema, type TranslationWire } from '@/lib/ai/translate-core'
import { fetchTedTranscript, parseTedSlug } from '@/lib/ingest/ted'
import { needsMachineTranslation } from '@/lib/ingest/transcript-cache'
import { readStoredTranscript } from '@/lib/ingest/transcript-store'
import {
  fingerprintCues,
  readStoredTranslation,
  storedTranslationPath,
  writeStoredTranslation,
} from '@/lib/ingest/translation-store'

const WORK_ROOT = join(process.cwd(), '.cache', 'translate')

const JobSchema = z.strictObject({
  version: z.literal(1),
  slug: z.string(),
  sourceLang: z.string(),
  fingerprint: z.string(),
  cueCount: z.number().int(),
  batches: z.array(
    z.strictObject({
      lines: z.array(z.strictObject({ index: z.number().int(), text: z.string() })),
      before: z.array(z.string()),
      after: z.array(z.string()),
    }),
  ),
})

type Job = z.infer<typeof JobSchema>

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function parseArgs(argv: readonly string[]) {
  const [command, input, ...rest] = argv
  if (command !== 'prepare' && command !== 'save') fail('usage: translate-agent.ts <prepare|save> <ted-url-or-slug> [--lang xx] [--force]')
  if (!input) fail('missing TED link or slug')

  const slug = parseTedSlug(input)
  if (!slug) fail(`"${input}" is not a TED talk link or slug`)

  const langAt = rest.indexOf('--lang')
  const lang = langAt >= 0 ? rest[langAt + 1] : undefined
  if (langAt >= 0 && !lang) fail('--lang needs a value')

  return { command, slug, lang, force: rest.includes('--force') }
}

function batchName(position: number): string {
  return `batch-${String(position).padStart(3, '0')}`
}

function workDir(slug: string, sourceLang: string): string {
  return join(WORK_ROOT, `${slug}.${sourceLang}`)
}

/** The same transcript the app shows — TED's, or the Whisper file when TED has none. */
function fetchTranscript(slug: string, lang: string | undefined) {
  return fetchTedTranscript(slug, { ...(lang ? { lang } : {}), storedTranscript: (video) => readStoredTranscript(video) })
}

async function prepare(slug: string, lang: string | undefined, force: boolean) {
  const transcript = await fetchTranscript(slug, lang)

  if (!needsMachineTranslation(transcript)) {
    console.log(
      transcript.translation
        ? `✓ Nothing to do: TED already has a ${transcript.translation.label} translation for "${transcript.source.title}".`
        : `✓ Nothing to do: "${transcript.source.title}" is already in ${transcript.langLabel}.`,
    )
    return
  }

  const existing = readStoredTranslation(slug, transcript.lang, transcript.cues)
  if (existing && !force) {
    console.log(
      `✓ Already translated (${Math.round(existing.translation.coverage * 100)}% of lines): ${storedTranslationPath(slug, transcript.lang)}`,
    )
    console.log('  Pass --force to translate it again.')
    return
  }

  const batches = buildTranslationBatches(transcript.cues)
  const meta = { title: transcript.source.title, ...(transcript.source.author ? { author: transcript.source.author } : {}) }
  const dir = workDir(slug, transcript.lang)

  // Answers left over from an earlier run may belong to different batches.
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  const job: Job = {
    version: 1,
    slug,
    sourceLang: transcript.lang,
    fingerprint: fingerprintCues(transcript.cues),
    cueCount: transcript.cues.length,
    batches,
  }
  writeFileSync(join(dir, 'job.json'), `${JSON.stringify(job, null, 2)}\n`, 'utf8')
  writeFileSync(join(dir, 'instructions.txt'), `${TRANSLATION_SYSTEM_PROMPT}\n`, 'utf8')
  batches.forEach((batch, position) => {
    writeFileSync(join(dir, `${batchName(position)}.prompt.txt`), `${buildTranslationUserPrompt(batch, meta)}\n`, 'utf8')
  })

  console.log(`✓ Prepared "${transcript.source.title}" — ${transcript.cues.length} lines in ${batches.length} batches.`)
  console.log(`  Work folder: ${dir}`)
  console.log('  Rules: instructions.txt')
  console.log(`  For each batch-NNN.prompt.txt write batch-NNN.json: {"lines":[{"index":<number>,"vi":"<Vietnamese>"}]}`)
}

function readAnswer(dir: string, position: number): { output: TranslationWire | null; problem?: string } {
  const path = join(dir, `${batchName(position)}.json`)
  if (!existsSync(path)) return { output: null, problem: 'answer file missing' }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { output: null, problem: `not valid JSON (${(error as Error).message})` }
  }

  const parsed = TranslationWireSchema.safeParse(raw)
  if (!parsed.success) return { output: null, problem: `wrong shape (${parsed.error.issues[0]?.message ?? 'invalid'})` }
  return { output: parsed.data }
}

async function save(slug: string, lang: string | undefined) {
  const transcript = await fetchTranscript(slug, lang)
  const dir = workDir(slug, transcript.lang)
  const jobPath = join(dir, 'job.json')
  if (!existsSync(jobPath)) fail(`no prepared job in ${dir} — run translate:prepare first`)

  const job = JobSchema.parse(JSON.parse(readFileSync(jobPath, 'utf8')))
  if (job.fingerprint !== fingerprintCues(transcript.cues)) {
    fail('the transcript on TED changed since prepare — run translate:prepare again')
  }

  const problems: string[] = []
  const outputs = job.batches.map((batch, position) => {
    const { output, problem } = readAnswer(dir, position)
    if (problem) problems.push(`${batchName(position)}: ${problem}`)
    return output
  })

  const stray = readdirSync(dir).filter((name) => /^batch-\d{3}\.json$/.test(name) && Number(name.slice(6, 9)) >= job.batches.length)
  if (stray.length > 0) problems.push(`ignored files for batches that do not exist: ${stray.join(', ')}`)

  // Same gate as the API path: an index outside its own batch is dropped, so a
  // translation can never land under a line it was not written for.
  const merged = mergeTranslations(transcript.cues, job.batches, outputs)

  const missing = merged.texts.flatMap((text, index) => (text === null ? [index] : []))
  job.batches.forEach((batch, position) => {
    const gaps = batch.lines.filter((line) => merged.texts[line.index] === null).map((line) => line.index)
    if (gaps.length > 0 && outputs[position]) problems.push(`${batchName(position)}: no usable translation for lines ${gaps.join(', ')}`)
  })

  if (merged.coverage === 0) fail(`nothing usable to save.\n  ${problems.join('\n  ')}`)

  const path = writeStoredTranslation({
    version: 1,
    slug,
    sourceLang: transcript.lang,
    targetLang: 'vi',
    fingerprint: job.fingerprint,
    cueCount: transcript.cues.length,
    texts: merged.texts,
    coverage: merged.coverage,
    translatedBy: 'claude-code-agent',
    createdAt: new Date().toISOString(),
  })

  console.log(`✓ Saved ${transcript.cues.length - missing.length}/${transcript.cues.length} lines (${Math.round(merged.coverage * 100)}%) to ${path}`)
  if (problems.length > 0) {
    console.log('  Problems — fix the batch files and run save again:')
    for (const problem of problems) console.log(`  - ${problem}`)
  }
}

const args = parseArgs(process.argv.slice(2))
try {
  if (args.command === 'prepare') await prepare(args.slug, args.lang, args.force)
  else await save(args.slug, args.lang)
} catch (error) {
  fail((error as Error).message)
}
