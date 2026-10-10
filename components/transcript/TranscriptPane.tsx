'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { formatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { Cue } from '@/types/transcript'

interface TranscriptPaneProps {
  cues: readonly Cue[]
  query: string
  matches: readonly number[]
  /** Index of the highlighted match, or -1. Scrolls into view when it changes. */
  focusedMatch: number
  showTranslation: boolean
  /** BCP-47 code of the translation, set on its element for screen readers and fonts. */
  translationLang?: string
  /** Cue under the playhead, or -1. Only set when the player reports its position. */
  activeIndex?: number
  /** Present only when the player can seek; turns each line into a "play from here" button. */
  onSeek?: (index: number) => void
  /**
   * The translation is machine output. It is still shown, but marked
   * `data-nosnippet` so search engines do not quote it: TED transcripts are
   * CC BY-NC-ND, and a machine translation is a derivative we do not publish.
   */
  translationIsMachine?: boolean
}

/** Splits a cue so the searched term can be marked without dangerous HTML. */
function highlight(text: string, query: string) {
  const needle = query.trim()
  if (needle.length === 0) return text

  const parts: React.ReactNode[] = []
  const haystack = text.toLowerCase()
  const lower = needle.toLowerCase()

  let cursor = 0
  let found = haystack.indexOf(lower, cursor)

  while (found !== -1) {
    if (found > cursor) parts.push(text.slice(cursor, found))
    parts.push(
      <mark key={`${found}`} className="rounded bg-accent-soft px-0.5 text-accent-ink">
        {text.slice(found, found + needle.length)}
      </mark>,
    )
    cursor = found + needle.length
    found = haystack.indexOf(lower, cursor)
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

/**
 * The transcript, following playback when the player reports its position.
 *
 * Lines are buttons only when the player can seek — a line that looks
 * clickable but does nothing (the TED embed) would be worse than plain text.
 *
 * Following stops the moment the reader scrolls on their own and a "back to
 * the current line" button appears; dragging the reader back while they read
 * ahead is the classic failure of this kind of app.
 */
export function TranscriptPane({
  cues,
  query,
  matches,
  focusedMatch,
  showTranslation,
  translationLang,
  activeIndex = -1,
  onSeek,
  translationIsMachine = false,
}: TranscriptPaneProps) {
  const t = useTranslations('watch')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [following, setFollowing] = useState(true)
  /**
   * False in the server HTML and the first client render. The virtualizer can
   * only draw rows once it can measure the scroll box, so on the server it
   * drew none at all — the page reached crawlers and no-JS readers with no
   * transcript in it (ui-ux rule: content must not depend on JS). Until
   * hydration every line is rendered as plain text; then the virtual list
   * takes over.
   */
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])
  const matchSet = useRef<Set<number>>(new Set())
  matchSet.current = new Set(matches)

  // A twenty-minute talk is already ~170 cues and a long one runs to thousands;
  // rendering them all locks up the phone.
  const virtualizer = useVirtualizer({
    count: cues.length,
    getScrollElement: () => scrollRef.current,
    // A translated row is roughly twice as tall; a close estimate keeps the
    // scrollbar from jumping while rows are measured.
    estimateSize: () => (showTranslation ? 128 : 78),
    overscan: 12,
    getItemKey: (index) => cues[index]?.idx ?? index,
    // Following playback calls scrollToIndex from an effect on every line
    // change; with flushSync the virtualizer re-renders synchronously inside
    // React's commit and React logs "flushSync was called from inside a
    // lifecycle method". A normal batched re-render is a frame later at most.
    useFlushSync: false,
  })

  // Row heights change wholesale when the translation is toggled.
  useEffect(() => {
    virtualizer.measure()
  }, [showTranslation, virtualizer])

  // Jumping between search hits is an explicit request, so it always scrolls —
  // and it stops following, or the next line change would yank the hit away.
  useEffect(() => {
    const target = matches[focusedMatch]
    if (target === undefined) return
    setFollowing(false)
    virtualizer.scrollToIndex(target, { align: 'center' })
  }, [focusedMatch, matches, virtualizer])

  // Only input the reader makes counts as "scrolling on their own"; the scroll
  // events our own scrollToIndex fires must not switch following off.
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !onSeek) return
    const stop = () => setFollowing(false)
    const onPointerDown = (event: PointerEvent) => {
      // A press on the scrollbar itself lands on the container, not on a row.
      if (event.target === element) stop()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) stop()
    }
    element.addEventListener('wheel', stop, { passive: true })
    element.addEventListener('touchmove', stop, { passive: true })
    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('keydown', onKeyDown)
    return () => {
      element.removeEventListener('wheel', stop)
      element.removeEventListener('touchmove', stop)
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('keydown', onKeyDown)
    }
  }, [onSeek])

  useEffect(() => {
    if (!following || activeIndex < 0 || !onSeek) return
    virtualizer.scrollToIndex(activeIndex, { align: 'center' })
  }, [activeIndex, following, onSeek, virtualizer])

  const items = virtualizer.getVirtualItems()
  const nosnippet = translationIsMachine ? { 'data-nosnippet': true } : {}

  if (!hydrated) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2">
          <ol className="flex flex-col">
            {cues.map((cue) => {
              const translation = showTranslation ? cue.translation : undefined
              return (
                <li key={cue.idx} className="flex w-full gap-3 border-l-2 border-transparent px-3 py-3 sm:gap-4">
                  <span className="w-11 shrink-0 pt-0.5 font-mono text-xs text-faint tabular-nums sm:w-12 sm:text-sm">
                    {formatTimestamp(cue.startMs)}
                  </span>
                  <span className="block min-w-0 flex-1">
                    <span className="block text-[15px] leading-relaxed text-ink text-pretty sm:text-base">
                      {cue.speaker ? <span className="mr-1.5 font-semibold">{cue.speaker}:</span> : null}
                      {cue.text}
                    </span>
                    {translation ? (
                      <span
                        lang={translationLang}
                        {...nosnippet}
                        className="mt-1 block border-l-2 border-line pl-2.5 text-sm leading-relaxed text-muted text-pretty"
                      >
                        {translation}
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {items.map((item) => {
          const cue = cues[item.index]
          if (!cue) return null

          const isMatch = matchSet.current.has(item.index)
          const isFocusedMatch = matches[focusedMatch] === item.index
          const isActive = item.index === activeIndex
          const translation = showTranslation ? cue.translation : undefined
          const Row = onSeek ? 'button' : 'div'

          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <Row
                {...(onSeek
                  ? {
                      type: 'button' as const,
                      onClick: () => {
                        setFollowing(true)
                        onSeek(item.index)
                      },
                    }
                  : {})}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'flex w-full gap-3 rounded-lg border-l-2 px-3 py-3 text-left sm:gap-4',
                  isActive ? 'border-accent bg-raised' : 'border-transparent',
                  isFocusedMatch ? 'bg-accent-soft' : '',
                  onSeek && !isActive && !isFocusedMatch ? 'hover:bg-raised/60' : '',
                )}
              >
                <span
                  className={cn(
                    'w-11 shrink-0 pt-0.5 font-mono text-xs tabular-nums sm:w-12 sm:text-sm',
                    isFocusedMatch || isActive ? 'text-accent-ink' : isMatch ? 'text-accent' : 'text-faint',
                  )}
                >
                  {formatTimestamp(cue.startMs)}
                </span>
                {/* Spans, not p/div: a row can be a <button>, which only holds phrasing content. */}
                <span className="block min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[15px] leading-relaxed text-pretty sm:text-base',
                      isFocusedMatch ? 'text-accent-ink' : 'text-ink',
                    )}
                  >
                    {cue.speaker ? <span className="mr-1.5 font-semibold">{cue.speaker}:</span> : null}
                    {highlight(cue.text, query)}
                  </span>
                  {translation ? (
                    <span
                      lang={translationLang}
                      {...nosnippet}
                      className="mt-1 block border-l-2 border-line pl-2.5 text-sm leading-relaxed text-muted text-pretty"
                    >
                      {highlight(translation, query)}
                    </span>
                  ) : null}
                </span>
              </Row>
            </div>
          )
        })}
      </div>
    </div>

    {onSeek && !following && activeIndex >= 0 ? (
      <button
        type="button"
        onClick={() => setFollowing(true)}
        className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-accent-line bg-surface px-4 text-sm font-medium text-accent-ink shadow-md"
      >
        {t('backToPlaying')}
      </button>
    ) : null}
    </div>
  )
}
