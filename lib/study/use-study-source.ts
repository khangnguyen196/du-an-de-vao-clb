'use client'

import { useAuth } from '@/lib/auth/use-auth'

/**
 * Where this visitor's study data lives: the browser, or their account.
 *
 * "loading" while sign-in state is unknown — reading the browser store first
 * and then swapping to the account would flash someone else's progress (a
 * shared computer) or the wrong count.
 */
export type StudySource = { kind: 'loading' } | { kind: 'local' } | { kind: 'account'; userId: string }

export function useStudySource(): StudySource {
  const auth = useAuth()
  if (auth.status === 'loading') return { kind: 'loading' }
  if (auth.status === 'signed-in') return { kind: 'account', userId: auth.userId }
  return { kind: 'local' }
}

/** A stable key for memoising a store on the source. */
export function sourceKey(source: StudySource): string {
  return source.kind === 'account' ? `account:${source.userId}` : source.kind
}
