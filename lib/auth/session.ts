import { AppError, ERROR_CODES } from '@/lib/errors'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * The signed-in user's id, verified with Supabase Auth — not just decoded from
 * the cookie, which anyone can edit. Null when signed out or when Supabase is
 * not configured.
 */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

/** For actions that only make sense signed in. */
export async function requireUserId(): Promise<string> {
  const userId = await currentUserId()
  if (!userId) throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Sign in required')
  return userId
}
