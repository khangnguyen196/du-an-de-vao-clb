import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AccountMenu } from '@/components/auth/AccountMenu'
import { BrandMark } from '@/components/marketing/BrandMark'
import { WordBookLink } from '@/components/study/WordBookLink'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

/** Floating pill bar, pinned a little below the top edge as the page scrolls. */
export function SiteHeader() {
  const t = useTranslations()

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 rounded-full border border-line/80 bg-surface/80 pr-1.5 pl-2 shadow-[0_8px_30px_-12px_rgb(17_24_39/0.25)] backdrop-blur-md sm:h-16 sm:pr-2 sm:pl-3">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 rounded-full pr-2 font-semibold tracking-tight">
          <BrandMark />
          <span className="text-brand-gradient truncate text-base sm:text-lg">{t('common.appName')}</span>
        </Link>

        {/* Anchor nav is desktop-only; on a phone the page is short enough to scroll. */}
        <nav className="hidden items-center gap-1 text-sm font-medium text-muted md:flex">
          {(
            [
              ['#try', 'nav.try'],
              ['#how', 'nav.howItWorks'],
              ['#features', 'nav.features'],
              ['#faq', 'nav.faq'],
            ] as const
          ).map(([href, key]) => (
            <a key={href} href={href} className="rounded-full px-3 py-2 hover:bg-raised hover:text-ink">
              {t(key)}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <ThemeToggle />
          <WordBookLink compact />
          <AccountMenu />
          <a
            href="#start"
            className="hidden min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas transition-transform hover:scale-[1.03] active:scale-[0.98] sm:inline-flex"
          >
            {t('nav.start')}
          </a>
        </div>
      </div>
    </header>
  )
}
