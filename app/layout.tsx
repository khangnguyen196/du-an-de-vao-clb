import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { siteUrl } from '@/lib/site'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common')
  const locale = await getLocale()

  return {
    // Resolves relative URLs in Open Graph images and canonicals to the real domain.
    metadataBase: siteUrl(),
    title: {
      default: `${t('appName')} — ${t('tagline')}`,
      template: `%s — ${t('appName')}`,
    },
    description: t('tagline'),
    applicationName: t('appName'),
    openGraph: {
      type: 'website',
      siteName: t('appName'),
      locale: locale === 'en' ? 'en_US' : 'vi_VN',
    },
    twitter: { card: 'summary_large_image' },
    // Google Search Console ownership for ww-nu-lyart.vercel.app. Public by
    // design; removing it un-verifies the property.
    verification: { google: '_eQGSIzULnMG3-Jg5ynMw9O4LrdNaB3U79aCqEsFuYc' },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#12110e' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale}>
      <body className="min-h-screen-dvh antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
