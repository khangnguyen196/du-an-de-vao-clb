/**
 * Guards for page-wide study shortcuts (Space flips, arrows navigate, 1–4 rate).
 *
 * Duck-typed on purpose so they run in unit tests without a DOM.
 */

interface ElementLike {
  tagName?: unknown
  isContentEditable?: unknown
  getAttribute?: (name: string) => string | null
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'])

function asElement(target: unknown): ElementLike | null {
  return target !== null && typeof target === 'object' ? (target as ElementLike) : null
}

function tagOf(element: ElementLike): string {
  return typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
}

function inputType(element: ElementLike): string {
  return (element.getAttribute?.('type') ?? 'text').toLowerCase()
}

/** Somewhere the learner is typing — every shortcut must stay out of the way. */
export function isTypingTarget(target: unknown): boolean {
  const element = asElement(target)
  if (!element) return false
  if (element.isContentEditable === true) return true

  const tag = tagOf(element)
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has(inputType(element))
}

/** A control Space would press or toggle natively. */
export function isActivatableTarget(target: unknown): boolean {
  const element = asElement(target)
  if (!element) return false

  const tag = tagOf(element)
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true
  if (tag === 'INPUT' && NON_TEXT_INPUTS.has(inputType(element))) return true
  return element.getAttribute?.('role') === 'button'
}

/**
 * True when a page-wide shortcut should not handle this key.
 *
 * Typing always wins. Space also yields to a focused control: otherwise Space on
 * a focused "Save" button would flip the card instead of saving. (A focused
 * card is itself a button, so Space still flips it — natively.)
 */
export function shouldIgnoreShortcut(event: { key: string; code?: string; target: unknown }): boolean {
  if (isTypingTarget(event.target)) return true
  const isSpace = event.code === 'Space' || event.key === ' '
  return isSpace && isActivatableTarget(event.target)
}
