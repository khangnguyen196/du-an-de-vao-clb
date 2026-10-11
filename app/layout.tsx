import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { AccountSync } from '@/components/study/AccountSync'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { siteUrl } from '@/lib/site'
import './globals.css'

// Self-hosted at build time by next/font; the Vietnamese subset carries the
// stacked diacritics (ặ, ỗ) that a latin-only cut would render in a fallback.
const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--font-inter' })

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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b10' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return (
    // The theme script may set data-theme before React hydrates; that one
    // attribute differing from the server HTML is expected.
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen-dvh antialiased">
        <NextIntlClientProvider>
          {children}
          {/* Idle (renders nothing) unless signed in with something to bring over, or a save failed. */}
          <AccountSync />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
