import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { Cue, TranscriptTranslation } from '@/types/transcript'

/**
 * Translations written by the Claude Code `translator` subagent, stored as
 * files in the repo so a talk can carry a Vietnamese line under each English
 * one without an API key or API credit.
 *
 * Stopgap until GĐ4 moves translations into the `cues` table — do not build on
 * the file layout. Files are read from `process.cwd()`, which is the project
 * root in dev; a deployed build only sees them if they are traced into it.
 */
export const TRANSLATION_STORE_DIR = join('data', 'translations', 'ted')

/** Agent translations only ever target Vietnamese for now. */
const TARGET_LANG = 'vi'

/**
 * The stored texts are matched to cues by position, so they are only valid for
 * the exact cue list they were made from. If TED edits a transcript, or the
 * normaliser merges fragments differently, positions shift and every line would
 * sit one sentence off. The fingerprint catches that: a mismatch means the file
 * is ignored, never applied.
 */
export function fingerprintCues(cues: readonly Cue[]): string {
  const hash = createHash('sha256')
  for (const cue of cues) hash.update(`${String(cue.startMs)}\u0000${cue.text}\u0001`)
  return hash.digest('hex')
}

export const StoredTranslationSchema = z.strictObject({
  version: z.literal(1),
  slug: z.string().min(1),
  sourceLang: z.string().min(1),
  targetLang: z.literal(TARGET_LANG),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  cueCount: z.number().int().nonnegative(),
  texts: z.array(z.string().min(1).nullable()),
  coverage: z.number().min(0).max(1),
  translatedBy: z.literal('claude-code-agent'),
  createdAt: z.iso.datetime(),
})

export type StoredTranslation = z.infer<typeof StoredTranslationSchema>

export function storedTranslationPath(slug: string, sourceLang: string, root = process.cwd()): string {
  return join(root, TRANSLATION_STORE_DIR, `${slug}.${sourceLang}.${TARGET_LANG}.json`)
}

/** The label the UI shows: origin "model" renders as "bản dịch máy". */
function toTranscriptTranslation(stored: StoredTranslation): TranscriptTranslation {
  return { lang: TARGET_LANG, label: 'Tiếng Việt', origin: 'model', credits: [], coverage: stored.coverage }
}

/**
 * The stored translation for these exact cues, or null.
 *
 * Synchronous on purpose: the caller decides between "translation on its way"
 * and "none coming" without awaiting, and a small local file is cheap to read.
 * A file that is missing, malformed or made for different cues is treated as
 * absent — the page then falls back to the API path, never to wrong lines.
 */
export function readStoredTranslation(
  slug: string,
  sourceLang: string,
  cues: readonly Cue[],
  root = process.cwd(),
): { texts: (string | null)[]; translation: TranscriptTranslation } | null {
  const path = storedTranslationPath(slug, sourceLang, root)
  if (!existsSync(path)) return null

  let parsed: StoredTranslation
  try {
    const result = StoredTranslationSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    if (!result.success) {
      console.warn(`[translation-store] ignoring malformed ${path}:`, result.error.issues[0]?.message)
      return null
    }
    parsed = result.data
  } catch (error) {
    console.warn(`[translation-store] could not read ${path}:`, (error as Error).message)
    return null
  }

  if (parsed.cueCount !== cues.length || parsed.texts.length !== cues.length || parsed.fingerprint !== fingerprintCues(cues)) {
    console.warn(`[translation-store] ignoring ${path}: made for a different version of the transcript`)
    return null
  }

  return { texts: parsed.texts, translation: toTranscriptTranslation(parsed) }
}

export function writeStoredTranslation(stored: StoredTranslation, root = process.cwd()): string {
  const valid = StoredTranslationSchema.parse(stored)
  const path = storedTranslationPath(valid.slug, valid.sourceLang, root)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(valid, null, 2)}\n`, 'utf8')
  return path
}
