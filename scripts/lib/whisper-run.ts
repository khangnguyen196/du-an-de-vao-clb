/**
 * Running local Whisper on a TED talk's audio — shared by `npm run transcribe`
 * (talks with no transcript) and `npm run align` (word timings for talks that
 * have one). See ingest.md for why audio is fetched at all, and the rules it
 * is fetched under.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isTedMediaUrl, parseMediaPlaylist, pickAudioPlaylist } from '@/lib/ingest/hls-audio'
import type { TedTalkInfo } from '@/lib/ingest/ted'
import { WhisperOutputSchema, type WhisperOutput } from '@/lib/ingest/whisper'

export const MODEL = 'small.en'
const ROOT = process.cwd()
export const WORK_ROOT = join(ROOT, '.cache', 'transcribe')
const MODELS_DIR = join(ROOT, '.tools', 'whisper', 'models')
const VENV = join(ROOT, '.tools', 'whisper', 'venv')
const VENV_PYTHON = process.platform === 'win32' ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python')
const WORKER = join(ROOT, 'scripts', 'whisper', 'transcribe.py')

const REQUEST_TIMEOUT_MS = 30_000
const REQUEST_ATTEMPTS = 3
const DOWNLOAD_CONCURRENCY = 4
/** The audio should run as long as TED says the talk does; more apart than this is worth a warning. */
const LENGTH_WARNING_MS = 5_000
/** A cached Whisper run is reused only if it covers the talk to within this. */
const REUSE_LENGTH_TOLERANCE_MS = 10_000

export function whisperInstalled(): boolean {
  return existsSync(VENV_PYTHON)
}

async function fetchOnce(url: string): Promise<Response> {
  if (!isTedMediaUrl(url)) throw new Error(`refusing to fetch outside TED's hosts: ${url}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`TED returned ${String(response.status)} for ${url}`)
  return response
}

async function withRetries<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work()
    } catch (error) {
      if (attempt >= REQUEST_ATTEMPTS) throw error
    }
  }
}

const fetchText = (url: string) => withRetries(async () => (await fetchOnce(url)).text())
const fetchBytes = (url: string) => withRetries(async () => new Uint8Array(await (await fetchOnce(url)).arrayBuffer()))

/**
 * Downloads the audio rendition's segments in order into one file. MPEG-TS is
 * built to be cut and joined, so the segments concatenated byte for byte are a
 * valid stream the decoder reads from start to end.
 */
async function downloadAudio(streamUrl: string, dest: string): Promise<{ durationMs: number; bytes: number }> {
  const playlistUrl = pickAudioPlaylist(await fetchText(streamUrl), streamUrl)
  const playlist = parseMediaPlaylist(await fetchText(playlistUrl), playlistUrl)

  const parts: Uint8Array[] = new Array<Uint8Array>(playlist.segmentUrls.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < playlist.segmentUrls.length) {
      const index = next
      next += 1
      parts[index] = await fetchBytes(playlist.segmentUrls[index]!)
      done += 1
      if (done % 25 === 0 || done === parts.length) process.stdout.write(`  ${String(done)}/${String(parts.length)} audio segments\r`)
    }
  }
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker))
  process.stdout.write('\n')

  const bytes = parts.reduce((sum, part) => sum + part.byteLength, 0)
  writeFileSync(dest, Buffer.concat(parts))
  return { durationMs: playlist.durationMs, bytes }
}

function runWhisper(audioPath: string, outPath: string) {
  const result = spawnSync(VENV_PYTHON, [WORKER, audioPath, outPath, '--model', MODEL, '--models-dir', MODELS_DIR], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_SYMLINKS_WARNING: '1' },
  })
  // Thrown, not process.exit: an exit inside the caller's try would skip the
  // `finally` that deletes the audio.
  if (result.status !== 0) throw new Error(`Whisper exited with ${String(result.status ?? result.signal)}`)
}

function signedSeconds(ms: number): string {
  return `${ms >= 0 ? '+' : ''}${(ms / 1000).toFixed(2)} s`
}

/** The Whisper run already in .cache for this talk, if it is one we can trust for it. */
function readCachedRun(talk: TedTalkInfo, outPath: string): WhisperOutput | null {
  if (!existsSync(outPath)) return null
  try {
    const output = WhisperOutputSchema.parse(JSON.parse(readFileSync(outPath, 'utf8')))
    const sameLength = talk.durationMs === undefined || Math.abs(output.durationMs - talk.durationMs) <= REUSE_LENGTH_TOLERANCE_MS
    return output.model === MODEL && output.words.length > 0 && sameLength ? output : null
  } catch {
    return null
  }
}

/**
 * Every word Whisper hears in the talk, with times. Fetches only the audio
 * rendition into .cache/transcribe/<slug>/ and deletes it as soon as Whisper
 * is done (unless `keepAudio`). With `reuseCached`, an earlier run for the same
 * talk and model is used instead of running again.
 */
export async function hearTalk(
  talk: TedTalkInfo & { streamUrl: string },
  options: { keepAudio?: boolean; reuseCached?: boolean } = {},
): Promise<WhisperOutput> {
  const dir = join(WORK_ROOT, talk.slug)
  mkdirSync(dir, { recursive: true })
  const audioPath = join(dir, 'audio.ts')
  const outPath = join(dir, 'whisper.json')

  if (options.reuseCached) {
    const cached = readCachedRun(talk, outPath)
    if (cached) {
      console.log(`♪ Reusing the Whisper run already made for this talk (${String(cached.words.length)} words).`)
      return cached
    }
  }
  if (!whisperInstalled()) throw new Error('Whisper is not set up yet — run: npm run transcribe:setup')

  try {
    console.log(`↓ Fetching the audio of "${talk.title}"…`)
    const audio = await downloadAudio(talk.streamUrl, audioPath)
    console.log(`  ${(audio.bytes / 1024 / 1024).toFixed(1)} MB, ${(audio.durationMs / 60_000).toFixed(1)} min`)
    if (talk.durationMs !== undefined && Math.abs(audio.durationMs - talk.durationMs) > LENGTH_WARNING_MS) {
      console.warn(`  ! the audio runs ${signedSeconds(audio.durationMs - talk.durationMs)} against TED's stated length`)
    }

    console.log(`♪ Transcribing with Whisper ${MODEL} on the CPU…`)
    runWhisper(audioPath, outPath)
  } finally {
    // The talk's audio is TED's; it is only ever held for the length of this run.
    if (!options.keepAudio) rmSync(audioPath, { force: true })
  }

  const output = WhisperOutputSchema.parse(JSON.parse(readFileSync(outPath, 'utf8')))
  if (output.words.length === 0) throw new Error('Whisper heard no speech in this audio')
  return output
}
