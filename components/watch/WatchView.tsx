'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerMode } from '@/components/player/TedPlayer'
import { usePlaybackSync } from '@/components/player/usePlaybackSync'
import { SearchBar } from '@/components/transcript/SearchBar'
import { TranscriptPane } from '@/components/transcript/TranscriptPane'
import { WordBookLink } from '@/components/study/WordBookLink'
import { ExportMenu } from '@/components/watch/ExportMenu'
import { browserTranscriptTranslation, coverageOf } from '@/lib/ai/browser-translate'
import { applyTranslations } from '@/lib/ai/translate-core'
import { useBrowserTranslation, type BrowserTranslationState } from '@/lib/ai/use-browser-translation'
import { searchCues } from '@/lib/cues'
import { tedEmbedUrl } from '@/lib/ingest/ted'
import { rememberTalk } from '@/lib/recent-talks'
import type { DeferredTranslation } from '@/lib/ingest/transcript-cache'
import { formatDuration } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { Transcript } from '@/types/transcript'

const SHOW_TRANSLATION_KEY = 'abc:watch:show-translation'

// Which player works is a browser question (native HLS or not), so it is only
// decided on the client.
const TedPlayer = dynamic(() => import('@/components/player/TedPlayer').then((m) => m.TedPlayer), {
  ssr: false,
  loading: () => <div className="size-full bg-black" />,
})

/** Below this share of translated lines, say so rather than let gaps look like bugs. */
const COVERAGE_NOTE_BELOW = 0.95

interface MachineTranslationState {
  /** A translation is on its way; say so rather than claim there is none. */
  pending: boolean
  value: DeferredTranslation | null
}

/**
 * Resolves the machine translation the server started but did not wait for.
 *
 * `use()` would be the shorter spelling and the wrong one: it suspends, which
 * puts the reader back in front of a blank pane waiting for a translation of a
 * transcript that is already downloaded. Reading the promise into state instead
 * lets the English render immediately and the Vietnamese appear underneath it.
 */
function useMachineTranslation(
  promise: Promise<DeferredTranslation | null> | null | undefined,
): MachineTranslationState {
  const [state, setState] = useState<MachineTranslationState>(() => ({
    pending: promise != null,
    value: null,
  }))

  useEffect(() => {
    if (!promise) {
      setState({ pending: false, value: null })
      return
    }

    let active = true
    setState({ pending: true, value: null })

    // The server side never rejects this, but a torn stream can; either way the
    // page keeps the transcript it already has.
    void promise.then(
      (value) => {
        if (active) setState({ pending: false, value })
      },
      () => {
        if (active) setState({ pending: false, value: null })
      },
    )

    return () => {
      active = false
    }
  }, [promise])

  return state
}

/** Lines the browser has translated so far, or null while it has none to show. */
function browserTexts(state: BrowserTranslationState): readonly (string | null)[] | null {
  if (state.status !== 'translating' && state.status !== 'done') return null
  return coverageOf(state.texts) > 0 ? state.texts : null
}

/**
 * Player and transcript side by side. When the talk's own stream plays here,
 * the transcript follows the playhead and a tap on a line seeks to it. When
 * only the official embed works (no stream, or a browser without native HLS),
 * the transcript is read, search and export only — the embed reports no
 * position, and a guessed highlight would drift within seconds.
 */
export function WatchView({
  transcript,
  machineTranslation = null,
  browserFallback = false,
}: {
  transcript: Transcript
  /** Unresolved on purpose — see `useMachineTranslation`. */
  machineTranslation?: Promise<DeferredTranslation | null> | null
  /** The talk needs a machine translation; the browser may try once the server comes back empty. */
  browserFallback?: boolean
}) {
  const t = useTranslations('watch')
  const tv = useTranslations('vocab')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playerMode, setPlayerMode] = useState<PlayerMode>('checking')

  const machine = useMachineTranslation(machineTranslation)

  // This page only renders for a talk that opened, so it is one the link box
  // can suggest again with confidence.
  useEffect(() => {
    rememberTalk({
      slug: transcript.source.externalId,
      title: transcript.source.title,
      speaker: transcript.source.author ?? null,
      image: transcript.source.thumbnailUrl ?? null,
    })
  }, [transcript.source.externalId, transcript.source.title, transcript.source.author, transcript.source.thumbnailUrl])

  /*
   * Last in line: TED's human translation, then the agent's file and Claude via
   * the server, and only when all of those came back empty does the reader's
   * own browser try.
   */
  const browser = useBrowserTranslation({
    cues: transcript.cues,
    sourceLang: transcript.lang,
    enabled: browserFallback && !machine.pending && !machine.value,
  })
  const fromBrowser = machine.value ? null : browserTexts(browser.state)

  /*
   * Everything below reads from this, not from the prop: once the machine
   * translation lands it has to reach the pane, the search index and the export
   * menu alike, and a second source of truth is how one of them ends up stale.
   */
  const effective = useMemo<Transcript>(() => {
    if (machine.value) {
      return {
        ...transcript,
        cues: applyTranslations(transcript.cues, machine.value.texts),
        translation: machine.value.translation,
      }
    }
    if (fromBrowser) {
      return {
        ...transcript,
        cues: applyTranslations(transcript.cues, fromBrowser),
        translation: browserTranscriptTranslation(coverageOf(fromBrowser)),
      }
    }
    return transcript
  }, [transcript, machine.value, fromBrowser])

  const { cues, source, translation } = effective

  const synced = playerMode === 'stream'
  const { activeIndex, seek } = usePlaybackSync(videoRef, cues, synced)
  const seekToCue = useCallback(
    (index: number) => {
      const cue = cues[index]
      if (cue) seek(cue.startMs)
    },
    [cues, seek],
  )

  const [query, setQuery] = useState('')
  const [focusedMatch, setFocusedMatch] = useState(0)
  const [showTranslation, setShowTranslation] = useState(true)

  // Restore the reader's choice after mount; the server cannot see storage.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SHOW_TRANSLATION_KEY)
      if (stored !== null) setShowTranslation(stored === '1')
    } catch {
      /* storage blocked — keep the default */
    }
  }, [])

  const toggleTranslation = useCallback(() => {
    setShowTranslation((current) => {
      const next = !current
      try {
        window.localStorage.setItem(SHOW_TRANSLATION_KEY, next ? '1' : '0')
      } catch {
        /* not remembered, still works */
      }
      return next
    })
  }, [])

  const translationVisible = showTranslation && translation !== undefined

  const matches = useMemo(
    () => searchCues(cues, query, { includeTranslation: translationVisible }),
    [cues, query, translationVisible],
  )

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return
      setFocusedMatch((current) => (current + direction + matches.length) % matches.length)
    },
    [matches.length],
  )

  const handleQuery = useCallback((value: string) => {
    setQuery(value)
    setFocusedMatch(0)
  }, [])

  /** Whisper's words, not TED's — said plainly, since some words will be wrong. */
  const machineTranscript = transcript.origin === 'whisper'
  const coveragePercent = translation ? Math.round(translation.coverage * 100) : 0
  const browserTranslating = browser.state.status === 'translating'

  return (
    <div className="flex h-screen-dvh flex-col overflow-hidden">
      {/* Top bar ---------------------------------------------------------- */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2 sm:px-4">
        <Link
          href="/"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink"
          aria-label={t('backHome')}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
            <path d="M14 6.5 12.6 5 6 11.6l6.6 6.6L14 16.8l-5.2-5.2z" />
          </svg>
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold sm:text-base">{source.title}</h1>
          <p className="truncate text-xs text-muted">
            {[
              source.author,
              transcript.langLabel,
              machineTranscript ? t('machineTranscript') : null,
              source.durationMs ? formatDuration(source.durationMs) : null,
              t('cueCount', { count: cues.length }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/watch/ted/${source.externalId}/vocab`}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
          >
            {tv('openVocab')}
          </Link>
          <WordBookLink compact />
          <div className="hidden sm:block">
            <ExportMenu transcript={effective} bilingualByDefault={translationVisible} />
          </div>
        </div>
      </header>

      {/* Player + transcript ---------------------------------------------- */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/*
          On a phone the player pins to the top of a non-scrolling column and the
          transcript scrolls underneath it — never a two-column squeeze.
        */}
        <div className="shrink-0 bg-ink lg:flex lg:w-[54%] lg:shrink lg:flex-col lg:justify-center lg:bg-transparent lg:p-5">
          <div className="aspect-video w-full overflow-hidden bg-black lg:rounded-xl">
            <TedPlayer
              {...(source.streamUrl ? { streamUrl: source.streamUrl } : {})}
              {...(source.thumbnailUrl ? { poster: source.thumbnailUrl } : {})}
              embedUrl={tedEmbedUrl(source.externalId)}
              title={source.title}
              videoRef={videoRef}
              onModeChange={setPlayerMode}
            />
          </div>

          <div className="hidden lg:mt-4 lg:block">
            <h2 className="text-lg leading-snug font-semibold text-balance">{source.title}</h2>
            {source.author ? <p className="mt-1 text-sm text-muted">{source.author}</p> : null}
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex min-h-11 items-center text-sm text-muted underline decoration-line underline-offset-4 hover:text-accent-ink"
            >
              {t('openOriginal')}
            </a>
          </div>
        </div>

        <section className="flex min-h-0 flex-1 flex-col border-t border-line lg:w-[46%] lg:border-t-0 lg:border-l">
          <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2 sm:px-4">
            <SearchBar
              value={query}
              onChange={handleQuery}
              matchCount={matches.length}
              focusedMatch={focusedMatch}
              onStep={handleStep}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              {translation ? (
                <button
                  type="button"
                  onClick={toggleTranslation}
                  aria-pressed={showTranslation}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium',
                    showTranslation
                      ? 'border-accent-line bg-accent-soft text-accent-ink'
                      : 'border-line text-muted hover:border-accent-line',
                  )}
                >
                  {t('translationToggle', { label: translation.label })}
                </button>
              ) : machine.pending ? (
                /* Announced, because the lines change under the reader when it lands. */
                <p role="status" aria-live="polite" className="py-1 text-xs text-muted">
                  {t('translationPending')}
                </p>
              ) : browser.state.status === 'needs-download' ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={browser.start}
                    className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
                  >
                    {t('browserTranslate')}
                  </button>
                  <p className="min-w-0 flex-1 basis-48 text-xs leading-snug text-muted">{t('browserTranslateHint')}</p>
                </div>
              ) : browser.state.status === 'downloading' ? (
                <p role="status" aria-live="polite" className="py-1 text-xs text-muted">
                  {browser.state.progress === null
                    ? t('browserPreparing')
                    : t('browserDownloading', { percent: Math.round(browser.state.progress * 100) })}
                </p>
              ) : browserTranslating ? (
                <p role="status" aria-live="polite" className="py-1 text-xs text-muted">
                  {t('browserTranslating', { done: 0, total: cues.length })}
                </p>
              ) : browser.state.status === 'failed' ? (
                <p className="py-1 text-xs text-muted">{t('browserFailed')}</p>
              ) : (
                <p className="py-1 text-xs text-muted">{t('noTranslation')}</p>
              )}

              <div className="shrink-0 sm:hidden">
                <ExportMenu transcript={effective} bilingualByDefault={translationVisible} />
              </div>
            </div>

            {translation && browser.state.status === 'translating' ? (
              /* Progress replaces the coverage note, which would read as gaps while lines are still arriving. */
              <p role="status" aria-live="polite" className="text-xs leading-snug text-muted">
                {t('browserTranslating', { done: browser.state.done, total: cues.length })}
              </p>
            ) : null}

            {translationVisible ? (
              <p className="text-xs leading-snug text-muted">
                {translation.origin === 'ted'
                  ? t('translationSource')
                  : fromBrowser
                    ? t('translationBrowser')
                    : t('translationMachine')}{' '}
                {translation.credits.map((credit, index) => (
                  <span key={credit.url}>
                    {index > 0 ? ' · ' : ''}
                    <a
                      href={credit.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-11 items-center underline decoration-line underline-offset-2 hover:text-ink"
                    >
                      {credit.name ?? t(credit.role === 'translator' ? 'translator' : 'reviewer')}
                    </a>
                  </span>
                ))}
                {translation.coverage < COVERAGE_NOTE_BELOW && !browserTranslating
                  ? ` · ${t('translationCoverage', { percent: coveragePercent })}`
                  : null}
              </p>
            ) : null}

            <p className="text-xs leading-snug text-faint">{synced ? t('syncHint') : t('noSync')}</p>
            <p className="text-xs leading-snug text-faint">
              {/* One paragraph with the credit: on a 640px-tall phone every line here is a transcript line fewer. */}
              {machineTranscript ? <span className="text-muted">{t('machineTranscriptHint')} </span> : null}
              {machineTranscript ? t('transcriptCreditWhisper') : t('transcriptCredit')}{' '}
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center underline decoration-line underline-offset-2 hover:text-ink"
              >
                {t('creditLink')}
              </a>
            </p>
          </div>

          <TranscriptPane
            cues={cues}
            query={query}
            matches={matches}
            focusedMatch={matches.length > 0 ? focusedMatch : -1}
            showTranslation={translationVisible}
            {...(translation ? { translationLang: translation.lang } : {})}
            activeIndex={activeIndex}
            translationIsMachine={translation?.origin === 'model'}
            {...(synced ? { onSeek: seekToCue } : {})}
          />
        </section>
      </div>
    </div>
  )
}
