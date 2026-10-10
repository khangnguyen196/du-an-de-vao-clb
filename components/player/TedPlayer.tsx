'use client'

import type HlsType from 'hls.js'
import { useEffect, useRef, useState, type RefObject } from 'react'

export type PlayerMode = 'checking' | 'stream' | 'embed'

/** How the stream is played: hls.js over MediaSource, or the browser's own HLS. */
type Engine = { kind: 'hlsjs'; Hls: typeof HlsType } | { kind: 'native' }

interface TedPlayerProps {
  /** Intro-free HLS stream; see `tedStreamUrl`. */
  streamUrl?: string
  /** TED's official embed, used whenever the stream cannot be played here. */
  embedUrl: string
  title: string
  poster?: string
  videoRef: RefObject<HTMLVideoElement | null>
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
 * hls.js is loaded only here, only on the watch page.
 */
export function TedPlayer({ streamUrl, embedUrl, title, poster, videoRef, onModeChange }: TedPlayerProps) {
  const [engine, setEngine] = useState<Engine | 'embed' | null>(null)
  const recovered = useRef(false)

  useEffect(() => {
    if (!streamUrl) {
      setEngine('embed')
      return
    }

    let cancelled = false
    const native = document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== ''

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return
        setEngine(Hls.isSupported() ? { kind: 'hlsjs', Hls } : native ? { kind: 'native' } : 'embed')
      })
      .catch((error: unknown) => {
        console.warn('[player] hls.js failed to load:', (error as Error).message)
        if (!cancelled) setEngine(native ? { kind: 'native' } : 'embed')
      })

    return () => {
      cancelled = true
    }
  }, [streamUrl])

  // Attach hls.js once the <video> is in the DOM.
  useEffect(() => {
    const video = videoRef.current
    if (!streamUrl || !video || engine === null || engine === 'embed' || engine.kind !== 'hlsjs') return

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
      console.warn('[player] TED stream failed, falling back to the embed:', data.details)
      setEngine('embed')
    })
    hls.loadSource(streamUrl)
    hls.attachMedia(video)

    return () => {
      hls.destroy()
    }
  }, [engine, streamUrl, videoRef])

  const mode: PlayerMode = engine === null ? 'checking' : engine === 'embed' ? 'embed' : 'stream'

  useEffect(() => {
    onModeChange(mode)
  }, [mode, onModeChange])

  if (mode === 'checking') return <div className="size-full bg-black" />

  if (mode === 'stream' && streamUrl && engine !== null && engine !== 'embed') {
    return (
      <video
        ref={videoRef}
        // hls.js feeds the element itself; only the browser's own HLS takes a src.
        {...(engine.kind === 'native' ? { src: streamUrl } : {})}
        poster={poster}
        title={title}
        controls
        playsInline
        preload="metadata"
        onError={() => {
          if (engine.kind !== 'native') return
          console.warn('[player] TED stream failed to load, falling back to the embed')
          setEngine('embed')
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
