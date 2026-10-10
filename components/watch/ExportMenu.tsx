'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { EXPORT_FORMATS, EXPORT_MIME, exportFilename, renderExport, type ExportFormat } from '@/lib/export'
import { cn } from '@/lib/utils'
import type { Transcript } from '@/types/transcript'

const LABEL_KEY: Record<ExportFormat, string> = {
  txt: 'exportTxt',
  srt: 'exportSrt',
  vtt: 'exportVtt',
  md: 'exportMd',
}

interface ExportMenuProps {
  transcript: Transcript
  /** Starting value of "include translation" — follows what is on screen. */
  bilingualByDefault: boolean
}

export function ExportMenu({ transcript, bilingualByDefault }: ExportMenuProps) {
  const t = useTranslations('watch')
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const [copied, setCopied] = useState(false)
  const hasTranslation = transcript.translation !== undefined
  const [bilingual, setBilingual] = useState(bilingualByDefault && hasTranslation)

  // Toggling the translation on screen should carry into what gets exported.
  useEffect(() => {
    setBilingual(bilingualByDefault && hasTranslation)
  }, [bilingualByDefault, hasTranslation])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  // Tapping outside closes the menu — <details> alone will not do that.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = detailsRef.current
      if (node && node.open && !node.contains(event.target as Node)) node.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const download = (format: ExportFormat) => {
    const blob = new Blob([renderExport(transcript, format, { bilingual })], { type: EXPORT_MIME[format] })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFilename(transcript, format, { bilingual })
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    if (detailsRef.current) detailsRef.current.open = false
  }

  const copy = async () => {
    await navigator.clipboard.writeText(renderExport(transcript, 'txt', { bilingual }))
    setCopied(true)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:border-accent-line hover:text-accent-ink"
      >
        {copied ? t('copied') : t('copy')}
      </button>

      <details ref={detailsRef} className="relative">
        <summary
          className={cn(
            'inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl',
            'border border-line px-3 text-sm font-medium hover:border-accent-line hover:text-accent-ink',
            '[&::-webkit-details-marker]:hidden',
          )}
        >
          {t('export')}
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
            <path d="M12 16.5 5.5 10l1.4-1.4 5.1 5.1 5.1-5.1L18.5 10z" />
          </svg>
        </summary>

        <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg">
          {hasTranslation ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-line px-3 text-sm">
              <input
                type="checkbox"
                checked={bilingual}
                onChange={(event) => setBilingual(event.target.checked)}
                className="size-4"
              />
              {t('exportBilingual')}
            </label>
          ) : null}
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => download(format)}
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-raised"
            >
              {t(LABEL_KEY[format])}
            </button>
          ))}
        </div>
      </details>
    </div>
  )
}
