'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { signOut } from '@/app/actions/auth'
import { useAuth } from '@/lib/auth/use-auth'
import { cn } from '@/lib/utils'

/**
 * "Sign in" when signed out, the account's initial and "Sign out" when signed
 * in, nothing at all on a deployment without accounts.
 */
export function AccountMenu({ className }: { className?: string }) {
  const t = useTranslations('auth')
  const auth = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (auth.status === 'unavailable') return null
  // Same footprint while loading, so the header does not jump.
  if (auth.status === 'loading') return <span aria-hidden className={cn('inline-block h-11 w-11', className)} />

  if (auth.status === 'signed-out') {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        aria-label={t('signIn')}
        className={cn(
          'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-sm font-medium hover:border-accent-line hover:text-accent-ink sm:px-4',
          className,
        )}
      >
        {/* An icon on a phone, where the app name needs the room; the words from sm up. */}
        <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current sm:hidden">
          <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v1.5h16V19c0-2.8-3.6-5-8-5Z" />
        </svg>
        <span className="hidden sm:inline">{t('signIn')}</span>
      </Link>
    )
  }

  const initial = (auth.email ?? '?').charAt(0).toUpperCase()
  // <details>: opens on tap and on click alike, keyboard-operable, no hover-only menu.
  return (
    <details className={cn('group relative', className)}>
      <summary
        aria-label={auth.email ? t('signedInAs', { email: auth.email }) : t('account')}
        className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-line hover:border-accent-line [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">
          {initial}
        </span>
      </summary>
      <div className="absolute top-full right-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-2 shadow-[0_24px_60px_-20px_rgb(17_24_39/0.45)]">
        {auth.email ? <p className="truncate px-3 pt-2 pb-1 text-xs text-muted">{t('signedInAs', { email: auth.email })}</p> : null}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await signOut()
              // The browser client caches the session too; clear it so this tab flips at once.
              const { supabaseBrowserClient } = await import('@/lib/supabase/client')
              await supabaseBrowserClient()?.auth.signOut({ scope: 'local' })
              router.refresh()
            })
          }
          className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-medium hover:bg-raised disabled:opacity-50"
        >
          {pending ? t('signingOut') : t('signOut')}
        </button>
      </div>
    </details>
  )
}
