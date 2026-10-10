import { formatSrtTime, formatTimestamp, formatVttTime } from '@/lib/time'
import type { Cue, Transcript } from '@/types/transcript'

export const EXPORT_FORMATS = ['txt', 'srt', 'vtt', 'md'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const EXPORT_MIME: Record<ExportFormat, string> = {
  txt: 'text/plain;charset=utf-8',
  srt: 'application/x-subrip;charset=utf-8',
  vtt: 'text/vtt;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
}

export interface ExportOptions {
  withTimestamps?: boolean
  /** Put each line's translation directly under it, where one exists. */
  bilingual?: boolean
}

/** The translation for a cue, only when bilingual output was asked for. */
function secondLine(cue: Cue, bilingual: boolean): string | null {
  return bilingual && cue.translation ? cue.translation : null
}

function toTxt(cues: readonly Cue[], withTimestamps: boolean, bilingual: boolean): string {
  return cues
    .map((cue) => {
      const first = withTimestamps ? `[${formatTimestamp(cue.startMs)}] ${cue.text}` : cue.text
      const second = secondLine(cue, bilingual)
      if (!second) return first
      // Indent the translation under the text, past the timestamp if there is one.
      const indent = withTimestamps ? ' '.repeat(formatTimestamp(cue.startMs).length + 3) : ''
      return `${first}\n${indent}${second}`
    })
    .join(bilingual ? '\n\n' : '\n')
}

/** Subtitle formats take a second line natively: players show it under the first. */
function subtitleBody(cue: Cue, bilingual: boolean): string {
  const second = secondLine(cue, bilingual)
  return second ? `${cue.text}\n${second}` : cue.text
}

function toSrt(cues: readonly Cue[], bilingual: boolean): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${subtitleBody(cue, bilingual)}\n`,
    )
    .join('\n')
}

function toVtt(cues: readonly Cue[], bilingual: boolean): string {
  const body = cues
    .map((cue) => `${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}\n${subtitleBody(cue, bilingual)}\n`)
    .join('\n')
  return `WEBVTT\n\n${body}`
}

function toMarkdown(transcript: Transcript, bilingual: boolean): string {
  const { source, cues, translation } = transcript
  const credit =
    bilingual && translation
      ? `_${translation.label}: ${translation.origin === 'ted' ? 'TED' : 'machine translation'}_`
      : null

  const lines = [
    `# ${source.title}`,
    '',
    source.author ? `**${source.author}**` : null,
    `[${source.url}](${source.url})`,
    credit,
    '',
    '---',
    '',
    ...cues.map((cue) => {
      const first = `**[${formatTimestamp(cue.startMs)}]** ${cue.text}`
      const second = secondLine(cue, bilingual)
      return second ? `${first}  \n_${second}_\n` : first
    }),
  ]
  return lines.filter((line) => line !== null).join('\n')
}

export function renderExport(transcript: Transcript, format: ExportFormat, options?: ExportOptions): string {
  // Bilingual output silently degrading to monolingual would hand someone a
  // file that is not what they chose, so it only applies when data exists.
  const bilingual = (options?.bilingual ?? false) && transcript.translation !== undefined

  switch (format) {
    case 'txt':
      return toTxt(transcript.cues, options?.withTimestamps ?? true, bilingual)
    case 'srt':
      return toSrt(transcript.cues, bilingual)
    case 'vtt':
      return toVtt(transcript.cues, bilingual)
    case 'md':
      return toMarkdown(transcript, bilingual)
  }
}

/** Safe, readable filename derived from the source title. */
export function exportFilename(
  transcript: Transcript,
  format: ExportFormat,
  options?: { bilingual?: boolean },
): string {
  const slug =
    transcript.source.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || transcript.source.externalId

  const suffix = options?.bilingual && transcript.translation ? `.${transcript.lang}-${transcript.translation.lang}` : ''
  return `${slug}${suffix}.${format}`
}
