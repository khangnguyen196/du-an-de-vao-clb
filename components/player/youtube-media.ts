/**
 * YouTube's IFrame player dressed as the slice of HTMLMediaElement that
 * `usePlaybackSync` reads — `currentTime`, `paused`, `play()` and the media
 * events — so the transcript follows a YouTube video the same way it follows
 * TED's stream in a <video>.
 *
 * Used for talks TED has no stream for (TEDx mostly), where TED's own embed
 * just wraps the YouTube video and reports nothing.
 */

/** The parts of `YT.Player` used here; typed locally rather than pulling in @types/youtube. */
export interface YouTubePlayerLike {
  getCurrentTime(): number
  getPlaybackRate(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
}

/** `YT.PlayerState` values. */
export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

/**
 * YouTube refreshes `getCurrentTime()` a few times a second, not every frame.
 * Between refreshes the playhead is extrapolated from the last reading — never
 * by more than this, so a stall or an ad (which keeps reporting 0) cannot run
 * the highlight ahead of the speaker.
 */
export const MAX_EXTRAPOLATION_S = 0.5

/** A seek YouTube has not caught up with yet is trusted over stale readings for this long. */
const SEEK_GRACE_MS = 2_000

export class YouTubeMedia extends EventTarget {
  private raw = 0
  private rawAt = 0
  private playing = false
  private buffering = false
  private seekTarget: number | null = null
  private seekAt = 0

  constructor(
    private readonly player: YouTubePlayerLike,
    private readonly now: () => number = () => performance.now(),
  ) {
    super()
  }

  get currentTime(): number {
    const now = this.now()
    const reading = this.player.getCurrentTime() || 0
    if (reading !== this.raw) {
      this.raw = reading
      this.rawAt = now
    }

    let base = reading
    let since = now - this.rawAt
    if (this.seekTarget !== null) {
      // Until YouTube reports the new position, the old one would snap the
      // highlight back to where the reader just tapped away from.
      if (Math.abs(reading - this.seekTarget) < 1.5 || now - this.seekAt > SEEK_GRACE_MS) {
        this.seekTarget = null
      } else {
        base = this.seekTarget
        since = now - this.seekAt
      }
    }

    if (!this.playing || this.buffering) return base
    const rate = this.player.getPlaybackRate() || 1
    return base + Math.min((since / 1000) * rate, MAX_EXTRAPOLATION_S)
  }

  set currentTime(seconds: number) {
    this.seekTarget = seconds
    this.seekAt = this.now()
    this.dispatchEvent(new Event('seeking'))
    this.player.seekTo(seconds, true)
    this.dispatchEvent(new Event('seeked'))
  }

  get paused(): boolean {
    return !this.playing
  }

  play(): Promise<void> {
    this.player.playVideo()
    return Promise.resolve()
  }

  /** Feed every `onStateChange` from the YouTube player through here. */
  handleState(state: number): void {
    this.buffering = state === YT_STATE.BUFFERING
    if (state === YT_STATE.PLAYING && !this.playing) {
      this.playing = true
      this.rawAt = this.now()
      this.dispatchEvent(new Event('play'))
    } else if (state === YT_STATE.PAUSED && this.playing) {
      this.playing = false
      this.dispatchEvent(new Event('pause'))
    } else if (state === YT_STATE.ENDED) {
      this.playing = false
      this.dispatchEvent(new Event('ended'))
    } else if (state === YT_STATE.CUED) {
      this.dispatchEvent(new Event('loadedmetadata'))
    }
  }
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      host?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: { target: YouTubePlayerLike & { destroy(): void } }) => void
        onStateChange?: (event: { data: number }) => void
        onError?: (event: { data: number }) => void
      }
    },
  ) => YouTubePlayerLike & { destroy(): void }
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api'
let apiPromise: Promise<YouTubeNamespace> | null = null

/** Loads YouTube's IFrame API once per page; later callers share the same load. */
export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube IFrame API loaded without a Player'))
    }
    const script = document.createElement('script')
    script.src = IFRAME_API_URL
    script.async = true
    script.onerror = () => {
      apiPromise = null
      reject(new Error('YouTube IFrame API failed to load'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}
