import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next, which is what normally loads .env.local.
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local')

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './supabase/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  // Supabase owns `auth`, `storage` and the rest; migrations only ever touch `public`.
  schemaFilter: ['public'],
  // Knows Supabase's built-in roles (authenticated, anon…) so policies can name them without creating them.
  entities: { roles: { provider: 'supabase' } },
  strict: true,
  verbose: true,
})
