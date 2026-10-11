'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth/use-auth'

/**
 * Where this page's progress is kept, said honestly: in the account when
 * signed in, otherwise in this browser — with the way to keep it if accounts
 * exist on this deployment.
 */
export function StorageNotice({ namespace }: { namespace: 'review' | 'wordBook' }) {
  const t = useTranslations(namespace)
  const tAuth = useTranslations('auth')
  const auth = useAuth()
  const pathname = usePathname()

  if (auth.status === 'loading') return <>{' '}</>
  if (auth.status === 'signed-in') return <>{t('inAccount')}</>
  if (auth.status === 'unavailable') return <>{t('localOnly')}</>

  return (
    <>
      {t('localOnly')}{' '}
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="inline-flex min-h-11 items-center underline decoration-line underline-offset-2 hover:text-ink"
      >
        {tAuth('keepIt')}
      </Link>
    </>
  )
}
