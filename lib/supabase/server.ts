import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { supabasePublicEnv } from '@/lib/supabase/env'

/**
 * A Supabase client for one server request — RSC, Server Action or route.
 *
 * Created fresh every time, never cached at module level: it carries the
 * caller's session cookies, and a shared instance would hand one visitor's
 * session to the next request (pitfalls.md).
 *
 * Null when Supabase is not configured.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = supabasePublicEnv()
  if (!env) return null

  const store = await cookies()
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options)
        } catch {
          // A Server Component cannot set cookies. The middleware refreshes the
          // session on every request, so nothing is lost here.
        }
      },
    },
  })
}
