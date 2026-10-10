import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from '@/i18n/config'

/**
 * Single-locale-per-request setup (no `/vi` `/en` path segments yet). The
 * locale comes from a cookie so URLs stay clean while `en` is still a
 * secondary language.
 *
 * Trade-off: reading cookies opts every page into dynamic rendering. When the
 * public transcript pages need static generation for SEO (M6), move to
 * next-intl routing with a `[locale]` segment.
 */
export default getRequestConfig(async () => {
  const store = await cookies()
  const requested = store.get(LOCALE_COOKIE)?.value
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
