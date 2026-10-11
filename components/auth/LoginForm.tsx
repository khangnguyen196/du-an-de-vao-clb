'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import { sendMagicLink } from '@/app/actions/auth'
import { cn } from '@/lib/utils'

/**
 * One field, one button: the email gets a sign-in link. Says plainly when the
 * link is on its way, and when Supabase's mailer is out of sends for the hour.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputId = useId()
  const errorId = useId()

  if (sentTo) {
    return (
      <div role="status" className="rounded-2xl border border-accent-line bg-accent-soft p-5">
        <p className="font-semibold text-accent-ink">{t('sentTitle')}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">{t('sentBody', { email: sentTo })}</p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-4 inline-flex min-h-11 items-center text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t('useAnother')}
        </button>
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await sendMagicLink({ email, next })
          if (result.ok) setSentTo(email.trim())
          else setError(t(`error.${result.code === 'INVALID_EMAIL' || result.code === 'RATE_LIMITED' || result.code === 'DB_UNAVAILABLE' ? result.code : 'INTERNAL'}`))
        })
      }}
      className="flex flex-col gap-3"
    >
      <label htmlFor={inputId} className="text-sm font-medium">
        {t('emailLabel')}
      </label>
      <input
        id={inputId}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value)
          if (error) setError(null)
        }}
        placeholder={t('emailPlaceholder')}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        // 16px minimum: anything smaller makes iOS Safari zoom in on focus.
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-faint focus:border-accent-line focus:outline-none"
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-wrong">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || email.trim().length === 0}
        className={cn(
          'inline-flex min-h-12 items-center justify-center rounded-xl bg-ink px-5 font-semibold text-canvas',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {pending ? t('sending') : t('send')}
      </button>
    </form>
  )
}
