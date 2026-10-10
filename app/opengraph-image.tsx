import { getTranslations } from 'next-intl/server'
import { OG_SIZE, renderOgCard } from '@/lib/og'
import messages from '@/messages/vi.json'

export const size = OG_SIZE
export const contentType = 'image/png'
/**
 * Static, from the default locale's messages. `generateImageMetadata` would
 * let it follow the visitor's locale, but next-intl's server API throws there
 * ("not supported in Client Components") and that error took every page's
 * <title> and meta tags down with it.
 */
export const alt = `${messages.common.appName} — ${messages.common.tagline}`

/** The site-wide share preview; talk pages override it with their own title. */
export default async function Image() {
  const t = await getTranslations()
  return renderOgCard({
    appName: t('common.appName'),
    title: t('common.tagline'),
    subtitle: t('hero.badge'),
  })
}
