import { NextIntlClientProvider } from 'next-intl'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FlipCard, type FlipCardContent } from '@/components/study/FlipCard'
import messages from '@/messages/vi.json'

/*
 * Regression guard. A rewrite once dropped the `is-flipped` class: the flipped
 * state still changed (the rating buttons appeared), but the card never turned
 * over, so learners could not see the back at all. DOM-content checks passed
 * because the back face is always in the markup. This checks the class itself.
 */

const content: FlipCardContent = {
  display: 'resilience',
  ipa: '',
  partOfSpeech: 'noun',
  meaningVi: '',
  context: 'an invented line',
  startMs: 5000,
  senses: [
    {
      meaningVi: 'khả năng phục hồi',
      partOfSpeech: 'noun',
      isCommon: true,
      inTranscript: true,
      example: { en: 'An invented example.', vi: 'Một ví dụ.' },
      origin: 'note',
    },
  ],
}

function render(flipped: boolean): string {
  return renderToStaticMarkup(
    // The provider's props type requires `children`, so passing it as the third
    // createElement argument does not typecheck without a double cast.
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, {
      locale: 'vi',
      messages,
      timeZone: 'Asia/Ho_Chi_Minh',
      children: createElement(FlipCard, { content, flipped, onFlip: () => {} }),
    }),
  )
}

function cardClass(html: string): string {
  return /<button[^>]*class="([^"]*flip-card[^"]*)"/.exec(html)?.[1] ?? ''
}

describe('FlipCard', () => {
  it('turns the card over when flipped', () => {
    expect(cardClass(render(true)).split(/\s+/)).toContain('is-flipped')
  })

  it('shows the front when not flipped', () => {
    expect(cardClass(render(false)).split(/\s+/)).not.toContain('is-flipped')
  })

  it('exposes the flipped state to assistive technology', () => {
    expect(render(true)).toContain('aria-pressed="true"')
    expect(render(false)).toContain('aria-pressed="false"')
  })

  it('labels a learner-written meaning as the learner’s and keeps the source line apart', () => {
    const html = render(true)
    expect(html).toContain('Ghi chú của bạn')
    expect(html).toContain('Câu gốc trong bài')
  })
})
