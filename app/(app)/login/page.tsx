import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { LoginForm } from '@/components/auth/LoginForm'
import { safeNextPath } from '@/lib/auth/next-path'
import { currentUserId } from '@/lib/auth/session'
import { hasSupabase } from '@/lib/supabase/env'

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

const LoginQuery = z.object({ next: z.string().max(500).optional(), error: z.enum(['link']).optional() })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth')
  return { title: t('title'), robots: { index: false, follow: false } }
}

/**
 * Sign-in is optional: everything works without it, an account only keeps the
 * word book and review progress across devices.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations('auth')
  const query = LoginQuery.safeParse(await searchParams)
  const next = safeNextPath(query.success ? query.data.next : undefined)
  const linkFailed = query.success && query.data.error === 'link'

  if (await currentUserId()) redirect(next)

  return (
    <main className="mx-auto flex min-h-screen-dvh w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Link href={next} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted hover:text-ink">
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
          <path d="M14 6.5 12.6 5 6 11.6l6.6 6.6L14 16.8l-5.2-5.2z" />
        </svg>
        {t('back')}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
      <p className="mt-2 leading-relaxed text-muted text-pretty">{t('subtitle')}</p>

      {linkFailed ? (
        <p role="alert" className="mt-6 rounded-xl border border-wrong-line bg-wrong-soft p-4 text-sm leading-relaxed text-pretty">
          {t('linkFailed')}
        </p>
      ) : null}

      <div className="mt-8">
        {hasSupabase() ? <LoginForm next={next} /> : <p className="text-sm text-muted">{t('unavailable')}</p>}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-faint text-pretty">{t('optional')}</p>
    </main>
  )
}
