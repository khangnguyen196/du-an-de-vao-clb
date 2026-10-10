'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkBrowserTranslation,
  coverageOf,
  getBrowserTranslatorFactory,
  languagePair,
  translateLines,
  type BrowserTranslatorFactory,
} from '@/lib/ai/browser-translate'
import type { Cue } from '@/types/transcript'

export type BrowserTranslationState =
  /** Not wanted, not checked yet, or the browser has no Translator API. */
  | { status: 'off' }
  /** The language model has to be downloaded first, which Chrome only allows from a click. */
  | { status: 'needs-download' }
  /** `progress` is 0–1, or null before Chrome reports any. */
  | { status: 'downloading'; progress: number | null }
  | { status: 'translating'; texts: readonly (string | null)[]; done: number }
  | { status: 'done'; texts: readonly (string | null)[]; coverage: number }
  | { status: 'failed' }

export interface BrowserTranslation {
  state: BrowserTranslationState
  /** Starts the download and translation. Call it straight from a click handler. */
  start: () => void
}

/**
 * Translates the transcript in the reader's browser when nothing better came
 * from the server.
 *
 * `enabled` must only turn true once the server has settled on "no
 * translation": every line this translates is a line Claude would have done
 * better, and both racing to fill the same pane would be worse than either.
 * When Chrome already holds the language model it starts on its own; when the
 * model still has to be downloaded the reader is asked first, since Chrome
 * refuses that download without a click.
 */
export function useBrowserTranslation({
  cues,
  sourceLang,
  enabled,
}: {
  cues: readonly Cue[]
  sourceLang: string
  enabled: boolean
}): BrowserTranslation {
  const [state, setState] = useState<BrowserTranslationState>({ status: 'off' })
  const run = useRef<AbortController | null>(null)

  const translate = useCallback(
    (factory: BrowserTranslatorFactory) => {
      run.current?.abort()
      const controller = new AbortController()
      run.current = controller
      const { signal } = controller

      setState({ status: 'downloading', progress: null })

      /*
       * `create` is called before any await: Chrome checks for a recent click
       * at the moment of the call, and an await in between can spend it.
       */
      const created = factory.create({
        ...languagePair(sourceLang),
        signal,
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (event) => {
            if (!signal.aborted) setState({ status: 'downloading', progress: event.loaded })
          })
        },
      })

      void (async () => {
        let translator: Awaited<typeof created> | null = null
        try {
          translator = await created
          signal.throwIfAborted()
          setState({ status: 'translating', texts: [], done: 0 })

          const texts = await translateLines(
            cues.map((cue) => cue.text),
            {
              translator,
              signal,
              onProgress: (snapshot, done) => {
                if (!signal.aborted) setState({ status: 'translating', texts: snapshot, done })
              },
            },
          )

          const coverage = coverageOf(texts)
          setState(coverage > 0 ? { status: 'done', texts, coverage } : { status: 'failed' })
        } catch (error) {
          if (signal.aborted) return
          console.warn('[browser-translate] translation failed:', (error as Error).message)
          setState({ status: 'failed' })
        } finally {
          translator?.destroy?.()
        }
      })()
    },
    [cues, sourceLang],
  )

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'off' })
      return
    }

    const factory = getBrowserTranslatorFactory()
    if (!factory) return

    let active = true
    void checkBrowserTranslation(factory, sourceLang).then((availability) => {
      if (!active) return
      if (availability === 'available') translate(factory)
      else if (availability === 'unavailable') setState({ status: 'off' })
      else setState({ status: 'needs-download' })
    })

    return () => {
      active = false
      run.current?.abort()
      run.current = null
    }
  }, [enabled, sourceLang, translate])

  const start = useCallback(() => {
    const factory = getBrowserTranslatorFactory()
    if (factory) translate(factory)
  }, [translate])

  return { state, start }
}
