import { useTranslations } from 'next-intl'

/** One 24×24 path per feature (Material Icons shapes, Apache-2.0). */
const ICONS = {
  highlight:
    'M6 14l3 3v5h6v-5l3-3V9H6v5zm5-12h2v3h-2V2zM3.5 5.88l1.41-1.41 2.12 2.12L5.62 8 3.5 5.88zm13.46.71 2.12-2.12 1.41 1.41L18.38 8l-1.42-1.41z',
  bilingual:
    'm12.87 15.07-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7 1.62-4.33L19.12 17h-3.24z',
  seek: 'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  cards:
    'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
  review:
    'M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8A5.87 5.87 0 0 1 6 12c0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z',
  quiz: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',
  export: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  mobile: 'M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
} as const

type IconName = keyof typeof ICONS

interface RibbonItem {
  icon: IconName | null
  text: string
}

/** Each item names its icon next to its words, so reordering the copy can never pair a feature with the wrong picture. */
function readItems(raw: unknown): RibbonItem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): RibbonItem[] => {
    if (typeof item !== 'object' || item === null) return []
    const { icon, text } = item as { icon?: unknown; text?: unknown }
    if (typeof text !== 'string') return []
    return [{ icon: typeof icon === 'string' && icon in ICONS ? (icon as IconName) : null, text }]
  })
}

/**
 * An endless ribbon of what the app does, sliding sideways under the hero —
 * where the reference design puts its "trusted by" logos. We have no logos to
 * borrow, so it lists features instead of inventing social proof.
 *
 * The moving copy is decoration (rendered twice for a seamless loop); screen
 * readers get the list once, as text. Hovering pauses it; reduced motion
 * stops it.
 */
export function FeatureRibbon() {
  const t = useTranslations('ribbon')
  const items = readItems(t.raw('items'))

  return (
    <div className="marquee relative overflow-hidden border-y border-line bg-surface/60 py-4 backdrop-blur [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <p className="sr-only">
        {t('label')}: {items.map((item) => item.text).join(', ')}
      </p>
      <div aria-hidden className="marquee-track flex w-max">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center gap-10 pr-10">
            {items.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm font-semibold whitespace-nowrap text-muted sm:text-base">
                {item.icon ? (
                  <span className="bg-brand-gradient grid size-7 shrink-0 place-items-center rounded-full text-white">
                    <svg viewBox="0 0 24 24" className="size-4 fill-current">
                      <path d={ICONS[item.icon]} />
                    </svg>
                  </span>
                ) : (
                  <span className="bg-brand-gradient size-2 rounded-full" />
                )}
                {item.text}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}
