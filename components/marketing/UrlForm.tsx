'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'
import { resolveSource } from '@/lib/ingest/resolve'
import { cn } from '@/lib/utils'

/** A talk with a real, human-written transcript — safe default for a first try. */
const SAMPLE = {
  url: 'https://www.ted.com/talks/brene_brown_the_power_of_vulnerability',
  label: 'Brené Brown, TED 2010',
}

export function UrlForm({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const t = useTranslations('hero')
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const errorId = useId()

  const go = (raw: string) => {
    const source = resolveSource(raw)

    // A YouTube link is valid, just unreadable. Saying "invalid link" would
    // send someone off checking a URL that was never the problem.
    if (source.status === 'youtube-blocked') {
      setError(t('youtubeBlocked'))
      return
    }
    if (source.status !== 'ok') {
      setError(t('invalidUrl'))
      return
    }

    setError(null)
    startTransition(() => router.push(source.href))
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          go(value)
        }}
        className={cn(
          'flex w-full flex-col gap-2',
          // Single column on phones; the input and button only sit side by side
          // once there is room for both to stay comfortably tappable.
          'sm:flex-row sm:items-center sm:gap-2 sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-2 sm:shadow-sm',
        )}
      >
        <label htmlFor="talk-url" className="sr-only">
          {t('placeholder')}
        </label>
        <input
          id="talk-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t('placeholder')}
          value={value}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          className={cn(
            'min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-ink',
            'placeholder:text-faint focus:outline-none',
            'sm:min-h-11 sm:flex-1 sm:border-transparent sm:bg-transparent sm:px-3 sm:shadow-none',
            size === 'lg' ? 'sm:text-lg' : '',
          )}
        />
        <button
          type="submit"
          disabled={pending}
          className={cn(
            // 48px tall: comfortably above the 44px touch-target floor.
            'min-h-12 shrink-0 rounded-xl bg-ink px-6 font-medium text-canvas',
            'transition-transform active:scale-[0.98] disabled:opacity-60',
            'hover:bg-accent-ink sm:min-h-11',
          )}
        >
          {pending ? t('submitting') : t('submit')}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {error ? (
          <p id={errorId} role="alert" className="text-accent-ink text-pretty">
            {error}
          </p>
        ) : (
          <>
            <span>{t('hint')}</span>
            <span aria-hidden className="text-line">
              •
            </span>
            <span>{t('sampleLabel')}</span>
            <button
              type="button"
              onClick={() => {
                setValue(SAMPLE.url)
                go(SAMPLE.url)
              }}
              className="underline decoration-accent-line underline-offset-4 hover:text-accent-ink"
            >
              {SAMPLE.label}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
