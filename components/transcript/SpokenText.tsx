'use client'

import { useEffect, useMemo, useState } from 'react'
import { findActiveCueIndex, splitAtMarks } from '@/lib/cues'
import { cn } from '@/lib/utils'
import type { CueMark } from '@/types/transcript'

/**
 * The playing line, lit up as it is spoken: what has been said reads in full
 * ink, the word (or TED phrase) being said is marked, what is still to come is
 * dimmed. Every boundary is a measured time (`Cue.marks`), never a guess.
 *
 * Mounted only for the one playing line, with its own frame loop reading the
 * playhead, so the rest of the transcript never re-renders for it. Colours
 * switch instantly — no transitions: motion in the transcript pane is off
 * limits (ui-ux rule).
 */
export function SpokenText({
  text,
  marks,
  unit,
  currentMs,
}: {
  text: string
  marks: readonly CueMark[]
  unit: 'phrase' | 'word'
  currentMs: () => number
}) {
  const pieces = useMemo(() => splitAtMarks(text, marks), [text, marks])
  const [at, setAt] = useState(() => findActiveCueIndex(marks, currentMs()))

  useEffect(() => {
    let frame = 0
    let last = -2
    const tick = () => {
      const index = findActiveCueIndex(marks, currentMs())
      if (index !== last) {
        last = index
        setAt(index)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [marks, currentMs])

  return pieces.map((piece, index) => {
    // The space after a word stays outside its highlight.
    const word = piece.replace(/\s+$/, '')
    const space = piece.slice(word.length)
    return (
      <span key={index}>
        <span
          className={cn(
            index < at && 'text-ink',
            index > at && 'text-ink/45',
            index === at &&
              // Padding comes from a ring (a shadow), not px-*: real padding
              // would push the following words along each time the word moves.
              (unit === 'word'
                ? 'rounded-sm bg-accent text-canvas ring-2 ring-accent [-webkit-box-decoration-break:clone] [box-decoration-break:clone]'
                : 'rounded-sm bg-accent/20 text-ink ring-2 ring-accent/20 [-webkit-box-decoration-break:clone] [box-decoration-break:clone]'),
          )}
        >
          {word}
        </span>
        {space}
      </span>
    )
  })
}
