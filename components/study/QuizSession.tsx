'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { shouldIgnoreShortcut } from '@/lib/study/keyboard'
import {
  askableCount,
  buildQuiz,
  clozeParts,
  isCorrect,
  QUIZ_KINDS,
  type QuizItem,
  type QuizKind,
  type QuizQuestion,
} from '@/lib/study/quiz'
import { useQuizHistory } from '@/lib/study/use-quiz-history'
import { formatTimestamp } from '@/lib/time'
import { cn } from '@/lib/utils'

const COUNTS = [5, 10, 20] as const

interface Answer {
  given: number | string
  correct: boolean
}

interface QuizSessionProps {
  items: readonly QuizItem[]
  /** `ted:<slug>` or `book` — keys the quiz history. */
  scope: string
  onClose: () => void
  /** Show which talk each word came from — for quizzes that span talks. */
  showSource?: boolean
  /** Offered after the quiz for words answered wrong that are not saved yet. */
  isSaved?: (id: string) => boolean
  onSave?: (ids: string[]) => void
}

/**
 * A quiz over the words handed in. Practice only: nothing here grades a card
 * on the review schedule.
 */
export function QuizSession({ items, scope, onClose, showSource = false, isSaved, onSave }: QuizSessionProps) {
  const t = useTranslations('quiz')
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const [count, setCount] = useState<number>(10)
  const [kinds, setKinds] = useState<QuizKind[]>([...QUIZ_KINDS])
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [typed, setTyped] = useState('')
  const [finished, setFinished] = useState(false)
  const { previous, record } = useQuizHistory(scope)
  const [savedNow, setSavedNow] = useState(false)
  /** True between answering a question and moving on to the next one. */
  const [showingFeedback, setShowingFeedback] = useState(false)

  const askable = useMemo(() => askableCount(items, kinds), [items, kinds])
  const withoutMeaning = useMemo(() => items.filter((item) => !item.meaning).length, [items])

  const start = useCallback(
    (pool: readonly QuizItem[], size: number) => {
      setQuestions(buildQuiz(pool, { count: size, kinds }))
      setAnswers([])
      setTyped('')
      setFinished(false)
      setSavedNow(false)
      setShowingFeedback(false)
    },
    [kinds],
  )

  const index = answers.length
  // While feedback is on screen the question just answered stays up.
  const question = questions && !finished ? (showingFeedback ? questions[index - 1] : questions[index]) : undefined

  const answer = useCallback(
    (given: number | string) => {
      if (!question || showingFeedback) return
      setAnswers((list) => [...list, { given, correct: isCorrect(question, given) }])
      setShowingFeedback(true)
    },
    [question, showingFeedback],
  )

  const next = useCallback(() => {
    if (!questions) return
    setShowingFeedback(false)
    setTyped('')
    if (answers.length >= questions.length) {
      const wrongIds = questions.filter((_, i) => !answers[i]?.correct).map((q) => q.itemId)
      void record({
        scope,
        at: new Date().toISOString(),
        total: questions.length,
        correct: questions.length - wrongIds.length,
        wrongIds,
      })
      setFinished(true)
    }
  }, [answers, questions, record, scope])

  // 1–4 picks an option. Never while typing — `shouldIgnoreShortcut` covers inputs.
  useEffect(() => {
    if (!question || question.kind === 'typing' || showingFeedback) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event)) return
      const pick = Number(event.key) - 1
      if (Number.isInteger(pick) && pick >= 0 && pick < question.options.length) answer(pick)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answer, question, showingFeedback])

  // --- setup ------------------------------------------------------------------

  if (questions === null) {
    return (
      <div className="flex flex-col gap-5 rounded-card border border-line bg-surface p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-muted text-pretty">{t('intro')}</p>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">{t('countLabel')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {COUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCount(value)}
                aria-pressed={count === value}
                className={cn(
                  'min-h-11 min-w-14 rounded-xl border px-3 text-sm font-medium',
                  count === value
                    ? 'border-accent-line bg-accent-soft text-accent-ink'
                    : 'border-line text-muted hover:border-accent-line hover:text-ink',
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">{t('kindsLabel')}</legend>
          <div className="mt-2 flex flex-col gap-2">
            {QUIZ_KINDS.map((kind) => {
              const on = kinds.includes(kind)
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    setKinds((list) => (on ? list.filter((k) => k !== kind) : [...list, kind]))
                  }
                  aria-pressed={on}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm',
                    on ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line text-muted hover:border-accent-line',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded border text-xs',
                      on ? 'border-accent-line bg-accent text-canvas' : 'border-line',
                    )}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{t(`kind.${kind}.label`)}</span>
                    <span className="block text-xs opacity-80">{t(`kind.${kind}.hint`)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1 text-sm text-muted">
          {withoutMeaning > 0 ? <p className="text-pretty">{t('withoutMeaning', { count: withoutMeaning })}</p> : null}
          {kinds.length > 0 && askable === 0 ? <p className="text-accent-ink text-pretty">{t('notEnough')}</p> : null}
          {previous ? (
            <p>{t('previous', { correct: previous.correct, total: previous.total })}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => start(items, count)}
            disabled={kinds.length === 0 || askable === 0}
            className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-40"
          >
            {t('start', { count: Math.min(count, askable) })}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-accent-line"
          >
            {t('close')}
          </button>
        </div>
      </div>
    )
  }

  // --- results ----------------------------------------------------------------

  if (finished || questions.length === 0) {
    const correct = answers.filter((a) => a.correct).length
    const wrong = questions.filter((_, i) => !answers[i]?.correct)
    const wrongItems = wrong.map((q) => itemById.get(q.itemId)).filter((item): item is QuizItem => Boolean(item))
    const unsavedWrong = isSaved ? wrongItems.filter((item) => !isSaved(item.id)) : []

    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="rounded-card border border-line bg-surface p-4 sm:p-6">
          <p className="text-sm text-muted">{t('resultTitle')}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {correct}/{questions.length}
          </p>
          {wrongItems.length === 0 ? <p className="mt-1 text-sm text-muted">{t('perfect')}</p> : null}
        </div>

        {wrongItems.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">{t('wrongList')}</h3>
            <ul className="mt-2 flex flex-col gap-px overflow-hidden rounded-card border border-line bg-line">
              {wrong.map((q) => {
                const item = itemById.get(q.itemId)
                if (!item) return null
                return (
                  <li key={q.itemId} className="bg-surface px-4 py-3 text-sm">
                    <p>
                      <span className="font-medium">{item.display}</span>
                      {item.meaning ? <span className="text-muted"> — {item.meaning}</span> : null}
                    </p>
                    <p className="mt-1 text-muted italic">
                      “{item.context}” · {formatTimestamp(item.startMs)}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {wrongItems.length > 0 ? (
            <button
              type="button"
              onClick={() => start(wrongItems, wrongItems.length)}
              className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-medium text-canvas hover:opacity-90"
            >
              {t('retryWrong', { count: wrongItems.length })}
            </button>
          ) : null}
          {onSave && unsavedWrong.length > 0 && !savedNow ? (
            <button
              type="button"
              onClick={() => {
                onSave(unsavedWrong.map((item) => item.id))
                setSavedNow(true)
              }}
              className="inline-flex min-h-11 items-center rounded-xl border border-accent-line px-4 text-sm font-medium text-accent-ink hover:bg-accent-soft"
            >
              {t('saveWrong', { count: unsavedWrong.length })}
            </button>
          ) : null}
          {savedNow ? <p className="self-center text-sm text-muted">{t('savedWrong')}</p> : null}
          <button
            type="button"
            onClick={() => setQuestions(null)}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-accent-line"
          >
            {t('again')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-accent-line"
          >
            {t('close')}
          </button>
        </div>
      </div>
    )
  }

  // --- question ---------------------------------------------------------------

  if (!question) return null
  const item = itemById.get(question.itemId)
  if (!item) return null

  const position = showingFeedback ? index : index + 1
  const result = showingFeedback ? answers[index - 1] : undefined
  const cloze = question.kind === 'cloze' ? clozeParts(item) : null
  const rightAnswer =
    question.kind === 'typing' ? item.display : question.options[question.correctIndex]!

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <span className="tabular-nums">{t('progress', { current: position, total: questions.length })}</span>
        <button
          type="button"
          onClick={() => setQuestions(null)}
          className="min-h-11 rounded-lg px-2 underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t('quit')}
        </button>
      </div>

      <div className="rounded-card border border-line bg-surface p-4 sm:p-6">
        <p className="text-sm text-muted">{t(`ask.${question.kind}`)}</p>

        {cloze ? (
          <p className="mt-3 text-lg leading-relaxed text-pretty">
            “{cloze.before}
            {result ? (
              <mark className="rounded bg-accent-soft px-1 font-medium text-accent-ink">{cloze.said}</mark>
            ) : (
              <span aria-label={t('blank')} className="inline-block min-w-16 border-b-2 border-ink align-baseline">
                &nbsp;
              </span>
            )}
            {cloze.after}”
          </p>
        ) : (
          <p className="mt-3 text-2xl font-semibold break-words text-pretty">
            {question.kind === 'wordToMeaning' ? item.display : item.meaning}
          </p>
        )}

        {question.kind === 'typing' ? (
          <p className="mt-2 text-sm text-faint">
            {t('typingHint', { first: item.display.charAt(0), length: item.display.length })}
          </p>
        ) : null}

        {showSource || (result && question.kind !== 'cloze') ? (
          <p className="mt-3 text-xs text-faint">
            {question.kind !== 'cloze' && result ? (
              <span className="mb-1 block text-sm text-muted italic">“{item.context}”</span>
            ) : null}
            {showSource ? (
              <Link href={item.sourcePath} className="underline decoration-line underline-offset-2 hover:text-ink">
                {item.sourceTitle}
              </Link>
            ) : null}
            {showSource ? ' · ' : ''}
            {formatTimestamp(item.startMs)}
          </p>
        ) : null}
      </div>

      {question.kind === 'typing' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (typed.trim()) answer(typed)
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={Boolean(result)}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label={t('typingLabel')}
            className={cn(
              'min-h-12 w-full rounded-xl border bg-canvas px-3 text-base text-ink focus:outline-none focus-visible:border-accent-line',
              result ? (result.correct ? 'border-accent-line' : 'border-wrong-line') : 'border-line',
            )}
          />
          {result ? null : (
            <button
              type="submit"
              disabled={!typed.trim()}
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-40"
            >
              {t('check')}
            </button>
          )}
        </form>
      ) : (
        <ol className="flex flex-col gap-2">
          {question.options.map((option, i) => {
            const chosen = result?.given === i
            const isRight = i === question.correctIndex
            return (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => answer(i)}
                  disabled={Boolean(result)}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left',
                    !result && 'border-line hover:border-accent-line',
                    result && isRight && 'border-accent-line bg-accent-soft text-accent-ink',
                    result && chosen && !isRight && 'border-wrong-line bg-wrong-soft text-wrong',
                    result && !chosen && !isRight && 'border-line opacity-60',
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md border border-current font-mono text-xs opacity-70">
                    {result && isRight ? '✓' : result && chosen ? '✗' : i + 1}
                  </span>
                  <span className="min-w-0 break-words">{option}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {result ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className={cn('text-sm font-medium', result.correct ? 'text-accent-ink' : 'text-wrong')}>
            {result.correct ? t('right') : t('wrong', { answer: rightAnswer })}
          </p>
          <button
            type="button"
            onClick={next}
            autoFocus
            className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-medium text-canvas hover:opacity-90"
          >
            {answers.length >= questions.length ? t('seeResult') : t('next')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
