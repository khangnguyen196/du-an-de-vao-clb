import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fingerprintCues,
  readStoredTranslation,
  storedTranslationPath,
  writeStoredTranslation,
  type StoredTranslation,
} from '@/lib/ingest/translation-store'
import type { Cue } from '@/types/transcript'

const cues: Cue[] = Array.from({ length: 3 }, (_, idx) => ({
  idx,
  startMs: idx * 1000,
  endMs: idx * 1000 + 1000,
  text: `Line ${idx}.`,
}))

function storedFor(lines: readonly Cue[], overrides: Partial<StoredTranslation> = {}): StoredTranslation {
  return {
    version: 1,
    slug: 'a_talk',
    sourceLang: 'en',
    targetLang: 'vi',
    fingerprint: fingerprintCues(lines),
    cueCount: lines.length,
    texts: ['Dòng 0.', null, 'Dòng 2.'],
    coverage: 2 / 3,
    translatedBy: 'claude-code-agent',
    createdAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  }
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'translation-store-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('fingerprintCues', () => {
  it('changes when a line is re-cut, even if the words stay the same', () => {
    const merged: Cue[] = [{ ...cues[0]!, text: 'Line 0. Line 1.' }, cues[2]!]
    expect(fingerprintCues(merged)).not.toBe(fingerprintCues(cues))
  })

  it('changes when only a start time moves', () => {
    const shifted = cues.map((cue, index) => (index === 1 ? { ...cue, startMs: cue.startMs + 500 } : cue))
    expect(fingerprintCues(shifted)).not.toBe(fingerprintCues(cues))
  })

  it('ignores a translation already on the cue', () => {
    const translated = cues.map((cue) => ({ ...cue, translation: 'x' }))
    expect(fingerprintCues(translated)).toBe(fingerprintCues(cues))
  })
})

describe('readStoredTranslation', () => {
  it('returns the stored lines, labelled as machine output', () => {
    writeStoredTranslation(storedFor(cues), root)

    const result = readStoredTranslation('a_talk', 'en', cues, root)

    expect(result?.texts).toEqual(['Dòng 0.', null, 'Dòng 2.'])
    expect(result?.translation).toMatchObject({ lang: 'vi', origin: 'model', coverage: 2 / 3, credits: [] })
  })

  it('returns null when nothing was stored for the talk', () => {
    expect(readStoredTranslation('a_talk', 'en', cues, root)).toBeNull()
  })

  it('keeps one file per source language', () => {
    writeStoredTranslation(storedFor(cues), root)
    expect(readStoredTranslation('a_talk', 'fr', cues, root)).toBeNull()
  })

  /** Positions shifted by one would put every Vietnamese line under the wrong sentence. */
  it('refuses a translation made for a different version of the transcript', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeStoredTranslation(storedFor(cues), root)
    const edited = cues.map((cue, index) => (index === 1 ? { ...cue, text: 'Edited.' } : cue))

    expect(readStoredTranslation('a_talk', 'en', edited, root)).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('treats a malformed file as absent instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const path = storedTranslationPath('a_talk', 'en', root)
    mkdirSync(dirname(path), { recursive: true })

    writeFileSync(path, '{ not json', 'utf8')
    expect(readStoredTranslation('a_talk', 'en', cues, root)).toBeNull()

    writeFileSync(path, JSON.stringify({ ...storedFor(cues), texts: ['Dòng 0.', '', 'Dòng 2.'] }), 'utf8')
    expect(readStoredTranslation('a_talk', 'en', cues, root)).toBeNull()

    warn.mockRestore()
  })
})

describe('writeStoredTranslation', () => {
  it('rejects a record that does not match the schema', () => {
    expect(() => writeStoredTranslation({ ...storedFor(cues), coverage: 2 }, root)).toThrow()
  })
})
