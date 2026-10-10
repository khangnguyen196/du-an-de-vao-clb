/**
 * Time is milliseconds everywhere in code and DB. These helpers are the only
 * place milliseconds get turned into human-readable strings.
 */

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms))
  return {
    hours: Math.floor(total / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
    millis: total % 1000,
  }
}

const pad = (value: number, size = 2) => String(value).padStart(size, '0')

/** "4:07" for short videos, "1:04:07" once the source passes an hour. */
export function formatTimestamp(ms: number, options?: { forceHours?: boolean }): string {
  const { hours, minutes, seconds } = split(ms)
  if (hours > 0 || options?.forceHours) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}

/** SRT uses a comma before the milliseconds, WebVTT uses a dot. */
export function formatSrtTime(ms: number): string {
  const { hours, minutes, seconds, millis } = split(ms)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`
}

export function formatVttTime(ms: number): string {
  return formatSrtTime(ms).replace(',', '.')
}

/** "1h 04m" / "12m 30s" — used for source duration labels. */
export function formatDuration(ms: number): string {
  const { hours, minutes, seconds } = split(ms)
  if (hours > 0) return `${hours}h ${pad(minutes)}m`
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`
  return `${seconds}s`
}
