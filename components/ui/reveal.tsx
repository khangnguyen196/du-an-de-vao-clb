'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * `idle`    — server output and pre-hydration. Always visible.
 * `pending` — armed and waiting to scroll into view. Only ever set on elements
 *             that are already off-screen, so nothing visibly disappears.
 * `done`    — revealed, and it stays that way.
 */
type RevealState = 'idle' | 'pending' | 'done'

interface RevealProps {
  children: React.ReactNode
  className?: string
  /** Anchor target, so `#how` style links can point straight at a section. */
  id?: string
  /** Stagger inside a list, in milliseconds. Keep it under ~300ms total. */
  delayMs?: number
  /** How much of the element must be visible before it reveals. */
  threshold?: number
  /** Render as a different element — `section` for page sections, `li` in lists. */
  as?: 'div' | 'section' | 'li' | 'article'
}

/**
 * The single scroll-reveal primitive (rule 7.2). Every marketing section goes
 * through this — no ad-hoc IntersectionObservers anywhere else.
 *
 * Content ships VISIBLE and is only hidden once JS has confirmed the element is
 * below the fold. A blank page while hydration is pending would fail the rule
 * this component exists to satisfy, and would gut SEO on transcript pages.
 *
 * Reveals once and stays revealed: replaying on every scroll-by is annoying,
 * not delightful.
 */
export function Reveal({
  children,
  className,
  id,
  delayMs = 0,
  threshold = 0.15,
  as: Tag = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<RevealState>('idle')

  useEffect(() => {
    const node = ref.current
    if (!node || state === 'done') return

    // Accessibility, not a preference: reduced motion means show it now.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      setState('done')
      return
    }

    // Already on screen — leave it alone rather than hiding it to animate it in.
    const rect = node.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setState('done')
      return
    }

    setState('pending')

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('done')
          observer.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
    // Runs once per element; `state` is read but must not retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold])

  return (
    <Tag
      ref={ref as React.Ref<never>}
      id={id}
      data-reveal={state}
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn(className)}
    >
      {children}
    </Tag>
  )
}
