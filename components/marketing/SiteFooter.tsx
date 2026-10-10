import { useTranslations } from 'next-intl'

export function SiteFooter() {
  const t = useTranslations()

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-medium text-ink">{t('common.appName')}</span> — {t('footer.rights')}
        </p>
        <p className="text-faint">{t('footer.madeWith')}</p>
      </div>
    </footer>
  )
}
