import { and, desc, eq, sql } from 'drizzle-orm'
import { db, type Database } from '@/lib/db'
import { cardNotes, quizAttempts, reviewCards } from '@/lib/db/schema'
import type { CardNote } from '@/lib/study/notes-store'
import { MAX_ATTEMPTS, type QuizAttempt } from '@/lib/study/quiz-store'
import type { ReviewRecord } from '@/lib/study/srs-store'

/**
 * Study data for one user. Every query takes the user id from a verified
 * session (`requireUserId`) and filters by it — the server's connection
 * bypasses RLS, so this filter is the boundary, not a convenience.
 *
 * Rows mirror the browser stores' shapes, so a record moves between the two
 * without translation beyond column names.
 */

type ReviewRow = typeof reviewCards.$inferSelect
type ReviewInsert = typeof reviewCards.$inferInsert

export function toReviewRow(userId: string, record: ReviewRecord): ReviewInsert {
  return {
    userId,
    cardId: record.id,
    deckId: record.deckId,
    term: record.term,
    snapshot: record.snapshot,
    scheduling: record.scheduling,
    dueAt: record.scheduling.due,
    addedAt: record.addedAt,
    firstReviewedAt: record.firstReviewedAt,
    inBook: record.inBook ?? null,
  }
}

/** Postgres hands timestamps back in its own format; the stores speak ISO 8601. */
function iso(value: string): string {
  return new Date(value).toISOString()
}

export function fromReviewRow(row: ReviewRow): ReviewRecord {
  return {
    id: row.cardId,
    deckId: row.deckId,
    term: row.term,
    snapshot: row.snapshot,
    scheduling: row.scheduling,
    addedAt: iso(row.addedAt),
    firstReviewedAt: row.firstReviewedAt ? iso(row.firstReviewedAt) : null,
    ...(row.inBook === null ? {} : { inBook: row.inBook }),
  }
}

export async function listReviewCards(userId: string, database: Database = db()): Promise<ReviewRecord[]> {
  const rows = await database.select().from(reviewCards).where(eq(reviewCards.userId, userId))
  return rows.map(fromReviewRow)
}

/** Inserts or replaces whole cards, like the browser store's `putMany`. */
export async function upsertReviewCards(
  userId: string,
  records: readonly ReviewRecord[],
  database: Database = db(),
): Promise<void> {
  if (records.length === 0) return
  await database
    .insert(reviewCards)
    .values(records.map((record) => toReviewRow(userId, record)))
    .onConflictDoUpdate({
      target: [reviewCards.userId, reviewCards.cardId],
      set: {
        deckId: sql`excluded.deck_id`,
        term: sql`excluded.term`,
        snapshot: sql`excluded.snapshot`,
        scheduling: sql`excluded.scheduling`,
        dueAt: sql`excluded.due_at`,
        addedAt: sql`excluded.added_at`,
        firstReviewedAt: sql`excluded.first_reviewed_at`,
        inBook: sql`excluded.in_book`,
        updatedAt: sql`now()`,
      },
    })
}

export async function listCardNotes(userId: string, database: Database = db()): Promise<CardNote[]> {
  const rows = await database.select().from(cardNotes).where(eq(cardNotes.userId, userId))
  return rows.map((row) => ({ id: row.cardId, senses: row.senses, updatedAt: iso(row.updatedAt) }))
}

export async function upsertCardNotes(userId: string, notes: readonly CardNote[], database: Database = db()): Promise<void> {
  if (notes.length === 0) return
  await database
    .insert(cardNotes)
    .values(notes.map((note) => ({ userId, cardId: note.id, senses: note.senses, updatedAt: note.updatedAt })))
    .onConflictDoUpdate({
      target: [cardNotes.userId, cardNotes.cardId],
      set: { senses: sql`excluded.senses`, updatedAt: sql`excluded.updated_at` },
    })
}

export async function deleteCardNote(userId: string, cardId: string, database: Database = db()): Promise<void> {
  await database.delete(cardNotes).where(and(eq(cardNotes.userId, userId), eq(cardNotes.cardId, cardId)))
}

/** Newest first, capped like the browser history. */
export async function listQuizAttempts(userId: string, database: Database = db()): Promise<QuizAttempt[]> {
  const rows = await database
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId))
    .orderBy(desc(quizAttempts.takenAt))
    .limit(MAX_ATTEMPTS)
  return rows.map((row) => ({
    scope: row.scope,
    at: iso(row.takenAt),
    total: row.total,
    correct: row.correct,
    wrongIds: row.wrongIds,
  }))
}

export async function insertQuizAttempts(
  userId: string,
  attempts: readonly QuizAttempt[],
  database: Database = db(),
): Promise<void> {
  if (attempts.length === 0) return
  await database.insert(quizAttempts).values(
    attempts.map((attempt) => ({
      userId,
      scope: attempt.scope,
      takenAt: attempt.at,
      total: attempt.total,
      correct: attempt.correct,
      wrongIds: attempt.wrongIds,
    })),
  )
}
