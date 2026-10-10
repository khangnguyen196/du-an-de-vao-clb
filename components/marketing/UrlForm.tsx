'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useId, useMemo, useState, useTransition } from 'react'
import { checkTalk } from '@/app/actions/check-talk'
import { resolveSource } from '@/lib/ingest/resolve'
import { readRecentTalks, type RecentTalk } from '@/lib/recent-talks'
import { buildSuggestions, type TalkSuggestion } from '@/lib/talk-suggestions'
import { cn } from '@/lib/utils'

/** A talk with a real, human-written transcript — safe default for a first try. */
const SAMPLE = {
  url: 'https://www.ted.com/talks/brene_brown_the_power_of_vulnerability',
  label: 'Brené Brown, TED 2010',
}

/**
 * The link box. Focusing it offers talks known to open — ones this browser
 * opened before, then the sample talks — filtered as you type a title, a
 * speaker or a link (an ARIA combobox: arrows move, Enter opens, Esc closes).
 *
 * A pasted link is checked on the server before navigating, so a talk TED
 * has not transcribed yet is reported right here, not on a dead-end page.
 */
export function UrlForm({ size = 'lg', align = 'start' }: { size?: 'lg' | 'md'; align?: 'start' | 'center' }) {
  const t = useTranslations()
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [recent, setRecent] = useState<RecentTalk[]>([])
  const [checking, setChecking] = useState(false)
  const [navigating, startTransition] = useTransition()
  const errorId = useId()
  // The landing page shows this form twice; fixed ids would be duplicated.
  const inputId = useId()
  const listId = useId()

  const suggestions = useMemo(() => buildSuggestions(value, recent), [value, recent])
  const showList = open && suggestions.length > 0
  const busy = checking || navigating

  const openTalk = (suggestion: TalkSuggestion) => {
    setOpen(false)
    setError(null)
    setValue(suggestion.title)
    startTransition(() => router.push(`/watch/ted/${suggestion.slug}`))
  }

  const go = async (raw: string) => {
    const source = resolveSource(raw)

    // A YouTube link is valid, just unreadable. Saying "invalid link" would
    // send someone off checking a URL that was never the problem.
    if (source.status === 'youtube-blocked') {
      setError(t('hero.youtubeBlocked'))
      return
    }
    if (source.status !== 'ok') {
      // Not a link: if the words match a known talk, open that instead.
      const match = suggestions[0]
      if (match && raw.trim().length > 0) {
        openTalk(match)
        return
      }
      setError(t('hero.invalidUrl'))
      return
    }

    setError(null)
    setOpen(false)

    // Only a TED talk can be checked ahead; any other kind of link has its
    // own page that explains what happens with it.
    if (source.kind !== 'ted') {
      startTransition(() => router.push(source.href))
      return
    }

    setChecking(true)
    try {
      const result = await checkTalk({ slug: source.id })
      if (result.ok) {
        startTransition(() => router.push(result.href))
      } else if (result.code === 'NO_CAPTIONS') {
        setError(t('hero.noTranscript'))
      } else if (result.retryAfterMinutes !== null) {
        setError(t('errors.RATE_LIMITED_TALKS', { minutes: result.retryAfterMinutes }))
      } else {
        const key = `errors.${result.code}`
        setError(t.has(key) ? t(key) : t('errors.INTERNAL'))
      }
    } catch {
      // The check itself failed (offline, server restarting): let the page try.
      startTransition(() => router.push(source.href))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="w-full">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const chosen = showList && active >= 0 ? suggestions[active] : undefined
          if (chosen) openTalk(chosen)
          else void go(value)
        }}
        className={cn(
          'relative flex w-full flex-col gap-2',
          // Single column on phones; the input and button only sit side by side
          // once there is room for both to stay comfortably tappable.
          'sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:border sm:border-line sm:bg-surface sm:p-1.5 sm:pl-3',
          'sm:shadow-[0_12px_40px_-16px_rgb(17_24_39/0.3)]',
        )}
      >
        <label htmlFor={inputId} className="sr-only">
          {t('hero.placeholder')}
        </label>
        <div className="relative sm:flex-1">
          <input
            id={inputId}
            name="url"
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${String(active)}` : undefined}
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('hero.placeholder')}
            value={value}
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            onFocus={() => {
              setRecent(readRecentTalks())
              setOpen(true)
            }}
            onBlur={() => setOpen(false)}
            onChange={(event) => {
              setValue(event.target.value)
              setOpen(true)
              setActive(-1)
              if (error) setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setOpen(true)
                setActive((current) => Math.min(current + 1, suggestions.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((current) => Math.max(current - 1, -1))
              } else if (event.key === 'Escape') {
                setOpen(false)
                setActive(-1)
              }
            }}
            className={cn(
              'min-h-12 w-full rounded-full border border-line bg-surface px-5 text-ink shadow-sm',
              'placeholder:text-faint focus:outline-none',
              'sm:min-h-11 sm:border-transparent sm:bg-transparent sm:px-3 sm:shadow-none',
              size === 'lg' ? 'sm:text-lg' : '',
            )}
          />

          {showList ? (
            <ul
              id={listId}
              role="listbox"
              aria-label={t('hero.suggestLabel')}
              className="suggest-pop absolute top-full right-0 left-0 z-50 mt-2 max-h-[22rem] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 text-left shadow-[0_24px_60px_-20px_rgb(17_24_39/0.45)] sm:-left-3"
            >
              {suggestions.map((suggestion, index) => {
                const firstOfKind = suggestions[index - 1]?.kind !== suggestion.kind
                return (
                  <li key={suggestion.slug} role="presentation">
                    {firstOfKind ? (
                      <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-faint uppercase">
                        {t(suggestion.kind === 'recent' ? 'hero.suggestRecent' : 'hero.suggestFeatured')}
                      </p>
                    ) : null}
                    <div
                      id={`${listId}-${String(index)}`}
                      role="option"
                      aria-selected={index === active}
                      // Keep focus in the input so the list does not close first.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openTalk(suggestion)}
                      onMouseEnter={() => setActive(index)}
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5',
                        index === active ? 'bg-accent-soft' : 'hover:bg-raised',
                      )}
                    >
                      <span className="relative block h-9 w-16 shrink-0 overflow-hidden rounded-lg bg-raised">
                        {suggestion.image ? (
                          <Image src={suggestion.image} alt="" fill sizes="64px" className="object-cover" />
                        ) : (
                          <span aria-hidden className="bg-brand-gradient absolute inset-0 grid place-items-center">
                            <svg viewBox="0 0 24 24" className="size-4 fill-white">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{suggestion.title}</span>
                        {suggestion.speaker ? (
                          <span className="block truncate text-xs text-muted">{suggestion.speaker}</span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={busy}
          className={cn(
            // 48px tall: comfortably above the 44px touch-target floor.
            'min-h-12 shrink-0 rounded-full bg-ink px-6 font-semibold text-canvas',
            'transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60',
          )}
        >
          {checking ? t('hero.checking') : navigating ? t('hero.submitting') : t('hero.submit')}
        </button>
      </form>

      <div
        className={cn(
          'mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted',
          align === 'center' && 'justify-center',
        )}
      >
        {error ? (
          <p id={errorId} role="alert" className={cn('font-medium text-wrong text-pretty', align === 'center' && 'text-center')}>
            {error}
          </p>
        ) : (
          <>
            <span>{t('hero.hint')}</span>
            <span aria-hidden className="text-line">
              •
            </span>
            <span>{t('hero.sampleLabel')}</span>
            <button
              type="button"
              onClick={() => {
                setValue(SAMPLE.url)
                void go(SAMPLE.url)
              }}
              className="inline-flex min-h-11 items-center underline decoration-accent-line underline-offset-4 hover:text-accent-ink"
            >
              {SAMPLE.label}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
