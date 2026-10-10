import { useTranslations } from 'next-intl'

export function SiteFooter() {
  const t = useTranslations()

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-muted sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex max-w-xl items-start gap-3">
          <span
            aria-hidden
            className="bg-brand-gradient grid size-8 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
          >
            {t('common.appName').charAt(0)}
          </span>
          <p className="text-pretty">
            <span className="font-semibold text-ink">{t('common.appName')}</span> — {t('footer.rights')}
          </p>
        </div>
        <p className="text-faint">{t('footer.madeWith')}</p>
      </div>
    </footer>
  )
}
