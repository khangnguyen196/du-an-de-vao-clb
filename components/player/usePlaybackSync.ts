'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { findActiveCueIndex } from '@/lib/cues'
import type { Cue } from '@/types/transcript'

/**
 * The cue under the playhead, read from the <video> itself.
 *
 * requestAnimationFrame while playing and a binary search per frame, so a talk
 * with thousands of cues costs nothing measurable; state changes only when the
 * line changes. While paused, seeks and metadata loads still update it.
 */
export function usePlaybackSync(
  videoRef: RefObject<HTMLVideoElement | null>,
  cues: readonly Cue[],
  enabled: boolean,
): { activeIndex: number; seek: (startMs: number) => void; currentMs: () => number } {
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video) {
      setActiveIndex(-1)
      return
    }

    let frame = 0
    let last = -2
    const update = () => {
      const index = findActiveCueIndex(cues, video.currentTime * 1000)
      if (index !== last) {
        last = index
        setActiveIndex(index)
      }
    }
    const loop = () => {
      update()
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      update()
    }

    video.addEventListener('play', start)
    video.addEventListener('pause', stop)
    video.addEventListener('ended', stop)
    // `seeking` fires as soon as the target is set, before any data arrives —
    // a tapped line lights up at once instead of after the buffer catches up.
    video.addEventListener('seeking', update)
    video.addEventListener('seeked', update)
    video.addEventListener('loadedmetadata', update)
    if (video.paused) update()
    else start()

    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener('play', start)
      video.removeEventListener('pause', stop)
      video.removeEventListener('ended', stop)
      video.removeEventListener('seeking', update)
      video.removeEventListener('seeked', update)
      video.removeEventListener('loadedmetadata', update)
    }
  }, [cues, enabled, videoRef])

  const seek = useCallback(
    (startMs: number) => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = startMs / 1000
      // Tapping a line means "play from here"; a refused autoplay just leaves it paused there.
      if (video.paused) void video.play().catch(() => {})
    },
    [videoRef],
  )

  /**
   * The playhead right now, read on demand. A getter rather than state: the
   * word inside the playing line changes several times a second, and only the
   * component drawing that one line should re-render for it.
   */
  const currentMs = useCallback(() => (videoRef.current?.currentTime ?? 0) * 1000, [videoRef])

  return { activeIndex, seek, currentMs }
}
