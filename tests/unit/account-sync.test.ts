import { readdirSync, readFileSync } from 'node:fs'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { safeNextPath } from '@/lib/auth/next-path'
import { fromReviewRow, toReviewRow } from '@/lib/db/queries/study'
import * as schema from '@/lib/db/schema'
import type { CardNote } from '@/lib/study/notes-store'
import type { QuizAttempt } from '@/lib/study/quiz-store'
import type { ReviewRecord } from '@/lib/study/srs-store'
import { chunk, isEmptyPlan, localIsAhead, planImport } from '@/lib/study/sync'

function card(id: string, reps: number, lastReview: string | null, extra: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id,
    deckId: 'ted:talk',
    term: id.split(':').pop()!,
    snapshot: {
      display: 'word',
      ipa: '',
      partOfSpeech: 'noun',
      meaningVi: 'từ',
      context: 'A word here.',
      startMs: 1000,
      cueIdx: 0,
      sourceTitle: 'Talk',
      sourcePath: '/watch/ted/talk/vocab',
    },
    scheduling: {
      due: '2026-10-12T00:00:00.000Z',
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps,
      lapses: 0,
      state: reps === 0 ? 0 : 2,
      last_review: lastReview,
    },
    addedAt: '2026-10-01T00:00:00.000Z',
    firstReviewedAt: reps === 0 ? null : '2026-10-02T00:00:00.000Z',
    ...extra,
  }
}

const note = (id: string, updatedAt: string): CardNote => ({
  id,
  updatedAt,
  senses: [{ meaningVi: 'nghĩa', partOfSpeech: '', inTranscript: true, example: { en: 'An example.', vi: 'Một ví dụ.' } }],
})

const attempt = (scope: string, at: string): QuizAttempt => ({ scope, at, total: 10, correct: 7, wrongIds: [] })

describe('localIsAhead', () => {
  it('prefers the copy studied more', () => {
    expect(localIsAhead(card('a', 3, '2026-10-05T00:00:00Z'), card('a', 2, '2026-10-09T00:00:00Z'))).toBe(true)
    expect(localIsAhead(card('a', 1, '2026-10-09T00:00:00Z'), card('a', 2, '2026-10-05T00:00:00Z'))).toBe(false)
  })

  it('breaks a tie on review count by the later review', () => {
    expect(localIsAhead(card('a', 2, '2026-10-09T00:00:00Z'), card('a', 2, '2026-10-05T00:00:00Z'))).toBe(true)
  })

  it('keeps the account’s copy when progress is equal', () => {
    expect(localIsAhead(card('a', 2, '2026-10-05T00:00:00Z', { inBook: false }), card('a', 2, '2026-10-05T00:00:00Z'))).toBe(false)
  })
})

describe('planImport', () => {
  it('uploads only what the account lacks or has less progress on', () => {
    const plan = planImport(
      {
        records: [card('new', 0, null), card('ahead', 4, '2026-10-09T00:00:00Z'), card('behind', 1, '2026-10-01T00:00:00Z')],
        notes: [note('n-new', '2026-10-05T00:00:00Z'), note('n-old', '2026-10-01T00:00:00Z'), note('n-newer', '2026-10-09T00:00:00Z')],
        attempts: [attempt('book', '2026-10-03T00:00:00Z'), attempt('book', '2026-10-04T00:00:00Z')],
      },
      {
        records: [card('ahead', 2, '2026-10-05T00:00:00Z'), card('behind', 5, '2026-10-08T00:00:00Z')],
        notes: [note('n-old', '2026-10-07T00:00:00Z'), note('n-newer', '2026-10-02T00:00:00Z')],
        attempts: [attempt('book', '2026-10-03T00:00:00Z')],
      },
    )

    expect(plan.records.map((r) => r.id)).toEqual(['new', 'ahead'])
    expect(plan.notes.map((n) => n.id)).toEqual(['n-new', 'n-newer'])
    expect(plan.attempts.map((a) => a.at)).toEqual(['2026-10-04T00:00:00Z'])
  })

  it('is empty when the account already has everything', () => {
    const local = { records: [card('a', 1, '2026-10-01T00:00:00Z')], notes: [], attempts: [] }
    expect(isEmptyPlan(planImport(local, local))).toBe(true)
  })
})

describe('chunk', () => {
  it('splits without losing or reordering anything', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
  })
})

describe('safeNextPath', () => {
  it.each(['/', '/words', '/watch/ted/some_talk/vocab?x=1'])('keeps in-app path %s', (path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  it.each([null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'words', '/a\nb'])(
    'sends %s home instead of off-site',
    (path) => {
      expect(safeNextPath(path)).toBe('/')
    },
  )
})

describe('review rows', () => {
  it('round-trip a card through its database row', () => {
    const record = card('ted:talk:word', 3, '2026-10-09T10:00:00.000Z', { inBook: true })
    const row = { ...toReviewRow('user-1', record), updatedAt: '2026-10-10 00:00:00+00' }
    expect(row.dueAt).toBe(record.scheduling.due)
    expect(fromReviewRow(row as Parameters<typeof fromReviewRow>[0])).toEqual(record)
  })

  it('normalises Postgres timestamps back to ISO and leaves a missing book flag out', () => {
    const record = card('ted:talk:word', 0, null)
    const row = { ...toReviewRow('user-1', record), addedAt: '2026-10-01 07:00:00+07', updatedAt: '2026-10-10 00:00:00+00' }
    const back = fromReviewRow(row as Parameters<typeof fromReviewRow>[0])
    expect(back.addedAt).toBe('2026-10-01T00:00:00.000Z')
    expect('inBook' in back).toBe(false)
  })
})

describe('row level security', () => {
  const tables = Object.values(schema).filter((value) => typeof value === 'object' && value !== null && 'getSQL' in value)
  const migrations = readdirSync('supabase/migrations')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
    .join('\n')

  it.each(tables.map((table) => [getTableConfig(table as never).name, table] as const))(
    '%s has RLS on and a policy, in both schema and migrations',
    (name, table) => {
      const config = getTableConfig(table as never)
      if (!config.columns.some((column) => column.name === 'user_id')) return
      expect(config.enableRLS || config.policies.length > 0).toBe(true)
      expect(config.policies.length).toBeGreaterThan(0)
      expect(migrations).toContain(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`)
      expect(migrations).toMatch(new RegExp(`CREATE POLICY "[^"]+" ON "${name}"`))
    },
  )
})
