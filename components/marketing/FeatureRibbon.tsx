import { useTranslations } from 'next-intl'

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
  const raw: unknown = t.raw('items')
  const items = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []

  return (
    <div className="marquee relative overflow-hidden border-y border-line bg-surface/60 py-4 backdrop-blur [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <p className="sr-only">
        {t('label')}: {items.join(', ')}
      </p>
      <div aria-hidden className="marquee-track flex w-max">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center gap-10 pr-10">
            {items.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm font-semibold whitespace-nowrap text-muted sm:text-base">
                <span className="bg-brand-gradient size-2 rounded-full" />
                {item}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}
