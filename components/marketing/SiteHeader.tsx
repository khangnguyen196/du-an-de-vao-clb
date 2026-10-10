import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { WordBookLink } from '@/components/study/WordBookLink'

export function SiteHeader() {
  const t = useTranslations()

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-md bg-ink text-[13px] font-bold text-canvas"
          >
            {t('common.appName').charAt(0)}
          </span>
          <span className="text-lg">{t('common.appName')}</span>
        </Link>

        {/* Anchor nav is desktop-only; on a phone the page is short enough to scroll. */}
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <a href="#how" className="hover:text-ink">
            {t('nav.howItWorks')}
          </a>
          <a href="#try" className="hover:text-ink">
            {t('nav.try')}
          </a>
          <a href="#features" className="hover:text-ink">
            {t('nav.features')}
          </a>
          <a href="#faq" className="hover:text-ink">
            {t('nav.faq')}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <WordBookLink compact />
          <a
            href="#start"
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
          >
            {t('nav.start')}
          </a>
        </div>
      </div>
    </header>
  )
}
