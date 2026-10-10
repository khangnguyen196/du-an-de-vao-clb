'use client'

import type HlsType from 'hls.js'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PlaybackMedia } from '@/components/player/usePlaybackSync'
import { loadYouTubeIframeApi, YouTubeMedia } from '@/components/player/youtube-media'

export type PlayerMode = 'checking' | 'stream' | 'youtube' | 'embed'

/** How the stream is played: hls.js over MediaSource, or the browser's own HLS. */
type Engine = { kind: 'hlsjs'; Hls: typeof HlsType } | { kind: 'native' }

interface TedPlayerProps {
  /** Intro-free HLS stream; see `tedStreamUrl`. */
  streamUrl?: string
  /** The YouTube video TED plays when it has no stream of its own (TEDx mostly). */
  youtubeId?: string
  /** TED's official embed, used whenever neither of the above can be played here. */
  embedUrl: string
  title: string
  poster?: string
  videoRef: RefObject<PlaybackMedia | null>
  /** Called after the chosen element is in the DOM, so `videoRef` is set for "stream". */
  onModeChange: (mode: PlayerMode) => void
}

/**
 * Plays TED's own HLS stream in a <video>, which — unlike the embed — tells
 * the page where playback is. That is what makes the transcript follow along
 * and lets a tap on a line seek to it.
 *
 * TED packs the stream as MPEG-TS, which Chrome, Edge and Firefox cannot play
 * natively (Chrome even answers "maybe" to canPlayType, then fails with a
 * format error). hls.js remuxes it through MediaSource, so it is preferred
 * wherever MediaSource exists; the browser's own HLS covers old iPhones; the
 * official embed, with no sync, is the last resort and the answer to any
 * stream that cannot be played.
 *
 * A talk TED has no stream for, but plays from YouTube, goes through YouTube's
 * IFrame API instead of TED's embed: it reports the playhead too. YouTube's own
 * ads come with it — they belong to the channel and are not ours to remove.
 *
 * hls.js is loaded only here, only on the watch page.
 */
export function TedPlayer({ streamUrl, youtubeId, embedUrl, title, poster, videoRef, onModeChange }: TedPlayerProps) {
  const [engine, setEngine] = useState<Engine | 'youtube' | 'embed' | null>(null)
  const [youtubeReady, setYoutubeReady] = useState(false)
  const recovered = useRef(false)
  const youtubeHost = useRef<HTMLDivElement | null>(null)
  // Where a broken stream falls back to: the synced YouTube player if TED names one.
  const fallback = youtubeId ? 'youtube' : 'embed'

  useEffect(() => {
    if (!streamUrl) {
      setEngine(youtubeId ? 'youtube' : 'embed')
      return
    }

    let cancelled = false
    const native = document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== ''

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return
        setEngine(Hls.isSupported() ? { kind: 'hlsjs', Hls } : native ? { kind: 'native' } : fallback)
      })
      .catch((error: unknown) => {
        console.warn('[player] hls.js failed to load:', (error as Error).message)
        if (!cancelled) setEngine(native ? { kind: 'native' } : fallback)
      })

    return () => {
      cancelled = true
    }
  }, [streamUrl, youtubeId, fallback])

  // Attach hls.js once the <video> is in the DOM.
  useEffect(() => {
    const video = videoRef.current
    if (!streamUrl || !video || engine === null || typeof engine === 'string' || engine.kind !== 'hlsjs') return

    const { Hls } = engine
    const hls = new Hls({ capLevelToPlayerSize: true })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return
      // One recovery attempt for a decode hiccup; anything else, or a second
      // failure, means this stream will not play here.
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered.current) {
        recovered.current = true
        hls.recoverMediaError()
        return
      }
      console.warn('[player] TED stream failed, falling back:', data.details)
      setEngine(fallback)
    })
    hls.loadSource(streamUrl)
    hls.attachMedia(video as HTMLVideoElement)

    return () => {
      hls.destroy()
    }
  }, [engine, streamUrl, videoRef, fallback])

  // Build the YouTube player once its host element is in the DOM.
  useEffect(() => {
    const host = youtubeHost.current
    if (engine !== 'youtube' || !youtubeId || !host) return

    let cancelled = false
    let player: { destroy(): void } | null = null
    let media: YouTubeMedia | null = null

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return
        player = new YT.Player(host, {
          videoId: youtubeId,
          // Privacy-enhanced mode: no YouTube cookies until the reader presses play.
          host: 'https://www.youtube-nocookie.com',
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: (event) => {
              if (cancelled) return
              media = new YouTubeMedia(event.target)
              // Set before the mode flips, so the sync finds it on its first run.
              videoRef.current = media
              setYoutubeReady(true)
            },
            onStateChange: (event) => media?.handleState(event.data),
            onError: (event) => {
              console.warn('[player] YouTube player error, falling back to the embed:', event.data)
              if (!cancelled) setEngine('embed')
            },
          },
        })
      })
      .catch((error: unknown) => {
        console.warn('[player] YouTube IFrame API unavailable, falling back to the embed:', (error as Error).message)
        if (!cancelled) setEngine('embed')
      })

    return () => {
      cancelled = true
      if (videoRef.current === media) videoRef.current = null
      setYoutubeReady(false)
      player?.destroy()
    }
  }, [engine, youtubeId, videoRef])

  const mode: PlayerMode =
    engine === null
      ? 'checking'
      : engine === 'embed'
        ? 'embed'
        : engine === 'youtube'
          ? youtubeReady
            ? 'youtube'
            : 'checking'
          : 'stream'

  useEffect(() => {
    onModeChange(mode)
  }, [mode, onModeChange])

  if (engine === 'youtube') {
    // YouTube replaces the inner element with its iframe; the wrapper keeps
    // React's own tree intact when it does.
    return (
      <div className="size-full bg-black [&_iframe]:size-full">
        <div ref={youtubeHost} />
      </div>
    )
  }

  if (mode === 'checking') return <div className="size-full bg-black" />

  if (mode === 'stream' && streamUrl && engine !== null && typeof engine !== 'string') {
    return (
      <video
        ref={(element) => {
          videoRef.current = element
        }}
        // hls.js feeds the element itself; only the browser's own HLS takes a src.
        {...(engine.kind === 'native' ? { src: streamUrl } : {})}
        poster={poster}
        title={title}
        controls
        playsInline
        preload="metadata"
        onError={() => {
          if (engine.kind !== 'native') return
          console.warn('[player] TED stream failed to load, falling back')
          setEngine(fallback)
        }}
        className="size-full bg-black"
      />
    )
  }

  return (
    <iframe
      src={embedUrl}
      title={title}
      allow="autoplay; fullscreen; encrypted-media"
      allowFullScreen
      className="size-full"
    />
  )
}
