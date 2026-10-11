'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicEnv } from '@/lib/supabase/env'

let client: SupabaseClient | null | undefined

/**
 * The browser's Supabase client — one per tab is right here, unlike on the
 * server: it only ever holds this visitor's own session. Used for auth state
 * only; study data goes through Server Actions and Drizzle.
 *
 * Null when Supabase is not configured.
 */
export function supabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client
  const env = supabasePublicEnv()
  client = env ? createBrowserClient(env.url, env.anonKey) : null
  return client
}
