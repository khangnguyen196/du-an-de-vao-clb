import { describe, expect, it, vi } from 'vitest'
import { MAX_EXTRAPOLATION_S, YouTubeMedia, YT_STATE, type YouTubePlayerLike } from '@/components/player/youtube-media'

function setup() {
  let now = 0
  const player = {
    time: 0,
    getCurrentTime: vi.fn(() => player.time),
    getPlaybackRate: vi.fn(() => 1),
    seekTo: vi.fn((seconds: number) => void seconds),
    playVideo: vi.fn(),
  }
  const media = new YouTubeMedia(player as YouTubePlayerLike, () => now)
  return {
    player,
    media,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('YouTubeMedia', () => {
  it('reads as paused and reports YouTube’s time until it plays', () => {
    const { player, media } = setup()
    player.time = 12.5
    expect(media.paused).toBe(true)
    expect(media.currentTime).toBe(12.5)
  })

  it('turns state changes into media events', () => {
    const { media } = setup()
    const seen: string[] = []
    for (const type of ['play', 'pause', 'ended', 'loadedmetadata']) media.addEventListener(type, () => seen.push(type))

    media.handleState(YT_STATE.CUED)
    media.handleState(YT_STATE.PLAYING)
    media.handleState(YT_STATE.PLAYING) // repeated: no second "play"
    media.handleState(YT_STATE.PAUSED)
    media.handleState(YT_STATE.ENDED)

    expect(seen).toEqual(['loadedmetadata', 'play', 'pause', 'ended'])
  })

  it('fills the gaps between YouTube’s readings while playing, but only a little', () => {
    const { player, media, advance } = setup()
    player.time = 10
    media.handleState(YT_STATE.PLAYING)
    expect(media.currentTime).toBe(10)

    advance(200)
    expect(media.currentTime).toBeCloseTo(10.2)

    // A stall or an ad keeps reporting the same time: the guess stops at the cap.
    advance(5_000)
    expect(media.currentTime).toBeCloseTo(10 + MAX_EXTRAPOLATION_S)

    // A fresh reading resets the clock.
    player.time = 11
    expect(media.currentTime).toBe(11)
  })

  it('does not run ahead while buffering', () => {
    const { player, media, advance } = setup()
    player.time = 30
    media.handleState(YT_STATE.PLAYING)
    media.handleState(YT_STATE.BUFFERING)
    advance(400)
    expect(media.currentTime).toBe(30)
  })

  it('seeks through YouTube and trusts the target until YouTube catches up', () => {
    const { player, media, advance } = setup()
    const seen: string[] = []
    media.addEventListener('seeking', () => seen.push('seeking'))
    media.addEventListener('seeked', () => seen.push('seeked'))

    player.time = 5
    media.currentTime = 120
    expect(player.seekTo).toHaveBeenCalledWith(120, true)
    expect(seen).toEqual(['seeking', 'seeked'])

    // YouTube still reports the old position for a moment.
    expect(media.currentTime).toBe(120)

    player.time = 120.1
    advance(100)
    expect(media.currentTime).toBeCloseTo(120.1)
  })

  it('gives up on a seek YouTube never reports', () => {
    const { player, media, advance } = setup()
    player.time = 5
    media.currentTime = 120
    advance(3_000)
    expect(media.currentTime).toBe(5)
  })

  it('plays through YouTube', async () => {
    const { player, media } = setup()
    await media.play()
    expect(player.playVideo).toHaveBeenCalled()
  })
})
