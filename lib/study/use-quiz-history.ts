'use client'

import { useCallback, useEffect, useState } from 'react'
import { readAttempts, recordAttempt, type QuizAttempt } from '@/lib/study/quiz-store'
import { lazyRemoteQuizHistory as remoteQuizHistory } from '@/lib/study/lazy-remote'
import { sourceKey, useStudySource } from '@/lib/study/use-study-source'

export interface QuizHistory {
  /** The latest attempt for this scope, or null — also null until history has loaded. */
  previous: QuizAttempt | null
  record: (attempt: QuizAttempt) => Promise<void>
}

/**
 * Quiz results for one scope, from the browser or from the account once
 * signed in. Recording never blocks the result screen: the attempt shows at
 * once and reaches the account behind it.
 */
export function useQuizHistory(scope: string): QuizHistory {
  const source = useStudySource()
  const key = sourceKey(source)
  const [attempts, setAttempts] = useState<QuizAttempt[] | null>(null)

  useEffect(() => {
    setAttempts(null)
    if (key === 'loading') return
    if (key === 'local') {
      setAttempts(readAttempts())
      return
    }
    let active = true
    remoteQuizHistory.list().then(
      (list) => active && setAttempts(list),
      () => active && setAttempts([]),
    )
    return () => {
      active = false
    }
  }, [key])

  const record = useCallback(
    async (attempt: QuizAttempt) => {
      if (key === 'loading') return
      if (key === 'local') {
        recordAttempt(attempt)
        setAttempts(readAttempts())
        return
      }
      setAttempts((current) => [attempt, ...(current ?? [])])
      try {
        await remoteQuizHistory.add([attempt])
      } catch {
        /* announced by the store */
      }
    },
    [key],
  )

  return { previous: attempts?.find((attempt) => attempt.scope === scope) ?? null, record }
}
