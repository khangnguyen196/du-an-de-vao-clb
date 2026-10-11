import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgPolicy, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authenticatedRole, authUid, authUsers } from 'drizzle-orm/supabase'
import type { NoteSense } from '@/lib/study/notes-store'
import type { ReviewScheduling, ReviewSnapshot } from '@/lib/study/srs-store'

/**
 * Source of truth for the database (data-model.md). Change it here, then
 * `npm run db:generate` and `npm run db:migrate` — never by hand in the
 * Supabase dashboard.
 *
 * Every table holding a user's data has RLS on, with its policy defined next
 * to the table so the migration carries both. The app itself reads and writes
 * through Drizzle on the server, always filtered by the verified user id; the
 * policies are what keeps the public anon key from reaching anyone's rows.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })

const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' })

/** Signed-in users see and change only their own rows. */
function ownRows(name: string, column: { name: string }) {
  const own = sql`${authUid} = ${sql.identifier(column.name)}`
  return pgPolicy(name, { for: 'all', to: authenticatedRole, using: own, withCheck: own })
}

/**
 * Spaced-repetition cards — the word book. One row per (user, card), the same
 * shape the browser store keeps: a content snapshot so the review queue can mix
 * talks without refetching them, and ts-fsrs scheduling as JSON.
 */
export const reviewCards = pgTable(
  'review_cards',
  {
    userId: userId(),
    /** `ted:<slug>:<term>` */
    cardId: text('card_id').notNull(),
    /** `ted:<slug>` */
    deckId: text('deck_id').notNull(),
    term: text('term').notNull(),
    snapshot: jsonb('snapshot').$type<ReviewSnapshot>().notNull(),
    scheduling: jsonb('scheduling').$type<ReviewScheduling>().notNull(),
    /** Copied out of `scheduling` so due cards can be queried and indexed. */
    dueAt: timestamptz('due_at').notNull(),
    addedAt: timestamptz('added_at').notNull(),
    firstReviewedAt: timestamptz('first_reviewed_at'),
    /** Null for records from before the word book existed; see `isInBook`. */
    inBook: boolean('in_book'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    index('review_cards_user_due_idx').on(t.userId, t.dueAt),
    ownRows('review_cards_own_rows', t.userId),
  ],
)

/** Meanings the learner wrote for a card. Kept apart from cards, which are rebuilt each time a deck opens. */
export const cardNotes = pgTable(
  'card_notes',
  {
    userId: userId(),
    cardId: text('card_id').notNull(),
    senses: jsonb('senses').$type<NoteSense[]>().notNull(),
    updatedAt: timestamptz('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] }), ownRows('card_notes_own_rows', t.userId)],
)

/** Finished quizzes. Outside the FSRS schedule on purpose — a quiz never moves a card. */
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userId(),
    /** `ted:<slug>` for one talk's words, `book` for the word book. */
    scope: text('scope').notNull(),
    takenAt: timestamptz('taken_at').notNull(),
    total: integer('total').notNull(),
    correct: integer('correct').notNull(),
    wrongIds: jsonb('wrong_ids').$type<string[]>().notNull(),
  },
  (t) => [
    index('quiz_attempts_user_scope_idx').on(t.userId, t.scope, t.takenAt),
    ownRows('quiz_attempts_own_rows', t.userId),
  ],
)
