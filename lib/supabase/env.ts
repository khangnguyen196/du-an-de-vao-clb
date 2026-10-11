/**
 * Supabase settings. Accounts are optional: with these unset the app runs as
 * before — everything in the browser, no sign-in button — so a deployment
 * without Supabase configured is not broken, just local-only.
 *
 * `NEXT_PUBLIC_*` values are inlined into the browser bundle by Next; they must
 * be read as literal `process.env.NAME` expressions for that to happen.
 */
export interface SupabasePublicEnv {
  url: string
  anonKey: string
}

export function supabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url && anonKey ? { url, anonKey } : null
}

export function hasSupabase(): boolean {
  return supabasePublicEnv() !== null
}
