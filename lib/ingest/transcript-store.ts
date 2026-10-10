import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type { RawSegment } from '@/lib/ingest/normalize'

/**
 * Transcripts made on the owner's machine with Whisper (`npm run transcribe`)
 * for talks TED has not transcribed yet. Read only when TED's page carries no
 * transcript, so the day TED publishes its own, that one takes over.
 *
 * Same stopgap as `translation-store.ts`: files read from `process.cwd()`,
 * shipped with deployments made from this machine, kept out of git. Moves into
 * the `transcripts`/`cues` tables with M2 — do not build on the file layout.
 */
export const TRANSCRIPT_STORE_DIR = join('data', 'transcripts', 'ted')

/**
 * Two talks' lengths may differ by rounding (TED reports whole seconds) but a
 * re-cut video differs by far more.
 */
const DURATION_TOLERANCE_MS = 1_500

export const StoredTranscriptSchema = z.strictObject({
  version: z.literal(1),
  slug: z.string().min(1),
  lang: z.string().min(1),
  /**
   * Path of the stream the audio came from, e.g. `/project_masters/842/manifest.m3u8`.
   * Times are only valid against that exact video: if TED swaps the video, the
   * path changes and the file is ignored rather than lighting up wrong lines.
   */
  streamPath: z.string().startsWith('/'),
  durationMs: z.number().int().positive(),
  engine: z.literal('faster-whisper'),
  engineVersion: z.string().min(1),
  model: z.string().min(1),
  segments: z
    .array(
      z.strictObject({
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
        text: z.string().min(1),
      }),
    )
    .min(1),
  createdAt: z.iso.datetime(),
})

export type StoredTranscript = z.infer<typeof StoredTranscriptSchema>

/** The video a stored transcript must match before it is used. */
export interface TalkVideoRef {
  slug: string
  lang: string
  streamUrl: string | null
  durationMs: number | undefined
}

export function storedTranscriptPath(slug: string, lang: string, root = process.cwd()): string {
  return join(root, TRANSCRIPT_STORE_DIR, `${slug}.${lang}.json`)
}

export function streamPathOf(streamUrl: string): string {
  return new URL(streamUrl).pathname
}

/**
 * The stored Whisper transcript for this exact video, or null. A file that is
 * missing, malformed or made from a different video counts as absent; the page
 * then reports "no transcript", never shows lines timed against another cut.
 */
export function readStoredTranscript(
  video: TalkVideoRef,
  root = process.cwd(),
): { segments: RawSegment[]; model: string } | null {
  const path = storedTranscriptPath(video.slug, video.lang, root)
  if (!existsSync(path)) return null

  let stored: StoredTranscript
  try {
    const result = StoredTranscriptSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    if (!result.success) {
      console.warn(`[transcript-store] ignoring malformed ${path}:`, result.error.issues[0]?.message)
      return null
    }
    stored = result.data
  } catch (error) {
    console.warn(`[transcript-store] could not read ${path}:`, (error as Error).message)
    return null
  }

  const sameStream = video.streamUrl !== null && streamPathOf(video.streamUrl) === stored.streamPath
  const sameLength =
    video.durationMs === undefined || Math.abs(video.durationMs - stored.durationMs) <= DURATION_TOLERANCE_MS
  if (!sameStream || !sameLength) {
    console.warn(`[transcript-store] ignoring ${path}: made from a different video than TED serves now`)
    return null
  }

  return { segments: stored.segments, model: stored.model }
}

export function writeStoredTranscript(stored: StoredTranscript, root = process.cwd()): string {
  const valid = StoredTranscriptSchema.parse(stored)
  const path = storedTranscriptPath(valid.slug, valid.lang, root)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(valid, null, 2)}\n`, 'utf8')
  return path
}
