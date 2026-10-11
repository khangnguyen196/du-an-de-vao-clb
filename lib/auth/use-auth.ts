'use client'

import { useEffect, useState } from 'react'
import { hasSupabase } from '@/lib/supabase/env'

export type AuthState =
  /** Not known yet — study data should wait rather than read the wrong store. */
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string | null }
  /** Supabase not configured: accounts do not exist on this deployment. */
  | { status: 'unavailable' }

/**
 * Who is signed in, for client components. Follows sign-in and sign-out in
 * this tab and in others (Supabase broadcasts auth changes across tabs).
 *
 * The id here decides which store to read; it is never trusted by the server,
 * which verifies the session itself on every action.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    if (!hasSupabase()) {
      setState({ status: 'unavailable' })
      return
    }

    let active = true
    let unsubscribe = () => {}
    const apply = (user: { id: string; email?: string | null } | null | undefined) => {
      if (!active) return
      setState(user ? { status: 'signed-in', userId: user.id, email: user.email ?? null } : { status: 'signed-out' })
    }

    // Loaded here rather than imported: supabase-js is the largest thing on the page,
    // and it is only worth its weight where accounts are switched on.
    void import('@/lib/supabase/client').then(({ supabaseBrowserClient }) => {
      const supabase = supabaseBrowserClient()
      if (!supabase || !active) return
      void supabase.auth.getSession().then(({ data }) => apply(data.session?.user))
      const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user))
      unsubscribe = () => data.subscription.unsubscribe()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return state
}
