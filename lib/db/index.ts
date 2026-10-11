import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { AppError, ERROR_CODES } from '@/lib/errors'
import * as schema from '@/lib/db/schema'

export type Database = PostgresJsDatabase<typeof schema>

/*
 * One pool per server instance, kept on globalThis so dev hot reloads do not
 * open a new pool each time. This holds a database connection, not a user's
 * session — unlike the Supabase server client it is safe to share.
 */
const globalForDb = globalThis as unknown as { abcDb?: Database }

/**
 * The server's database handle. Server-only: `DATABASE_URL` is a secret and
 * must never reach the browser bundle.
 *
 * Supabase's transaction pooler (port 6543) fits serverless — many short-lived
 * instances, few connections each — but it cannot keep prepared statements,
 * hence `prepare: false`.
 */
export function db(): Database {
  if (globalForDb.abcDb) return globalForDb.abcDb
  const url = process.env.DATABASE_URL
  if (!url) throw new AppError(ERROR_CODES.DB_UNAVAILABLE, 'DATABASE_URL is not configured')

  const client = postgres(url, { prepare: false, max: 3 })
  globalForDb.abcDb = drizzle(client, { schema })
  return globalForDb.abcDb
}
