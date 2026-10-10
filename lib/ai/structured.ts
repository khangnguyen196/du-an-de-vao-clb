import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai'
import type { ZodType } from 'zod'

/** The project's default model (see .claude/rules/stack.md). */
export const AI_MODEL = 'claude-sonnet-5'

export type Effort = 'low' | 'medium' | 'high'

export interface StructuredRequest<T> {
  /** Short snake_case name; providers use it as guidance for the schema. */
  name: string
  schema: ZodType<T>
  system: string
  prompt: string
  effort?: Effort
  maxOutputTokens?: number
}

export type StructuredGenerator = <T>(request: StructuredRequest<T>) => Promise<T>

export function hasAnthropicKey(): boolean {
  return typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY.length > 0
}

/**
 * One structured call to Claude through the AI SDK.
 *
 * Constraints that matter on claude-sonnet-5:
 * - no `temperature` / `top_p` / `top_k`: sampling parameters were removed and
 *   sending one is a 400;
 * - `generateObject` is deprecated in ai v7; `generateText` with `output` is
 *   the replacement;
 * - `structuredOutputMode: 'outputFormat'` asks for native structured output
 *   rather than a JSON tool workaround.
 *
 * Transport failures (429, 5xx, network) are retried by the SDK itself via
 * `maxRetries`.
 */
export function createStructuredGenerator(apiKey: string): StructuredGenerator {
  const anthropic = createAnthropic({ apiKey })

  return async <T>(request: StructuredRequest<T>): Promise<T> => {
    const result = await generateText({
      model: anthropic(AI_MODEL),
      system: request.system,
      prompt: request.prompt,
      output: Output.object({ schema: request.schema, name: request.name }),
      maxOutputTokens: request.maxOutputTokens ?? 16_000,
      maxRetries: 2,
      providerOptions: {
        anthropic: {
          structuredOutputMode: 'outputFormat',
          effort: request.effort ?? 'medium',
        },
      },
    })
    return result.output as T
  }
}

interface ApiErrorLike {
  statusCode?: unknown
  responseBody?: unknown
  message?: unknown
}

/**
 * The error and everything it wraps: `cause` (our AppError around the SDK
 * error) and `lastError` (the SDK's RetryError after retries run out).
 * Bounded, so a cyclic chain cannot loop.
 */
function errorChain(error: unknown): ApiErrorLike[] {
  const chain: ApiErrorLike[] = []
  let current: unknown = error
  while (current && typeof current === 'object' && chain.length < 5 && !chain.includes(current)) {
    chain.push(current)
    const next = current as { cause?: unknown; lastError?: unknown }
    current = next.cause ?? next.lastError
  }
  return chain
}

/**
 * True when the API refused because the account has no credit left.
 *
 * Anthropic reports this as a plain 400 `invalid_request_error` with no
 * dedicated error type, so the message is the only signal. It is worth telling
 * apart: "add credits" is an operator fix, not a bug, and retrying cannot help.
 * Duck-typed on the AI SDK's APICallError shape.
 */
export function isBillingError(error: unknown): boolean {
  return errorChain(error).some(
    ({ statusCode, responseBody }) =>
      statusCode === 400 && typeof responseBody === 'string' && /credit balance/i.test(responseBody),
  )
}

/**
 * True when the API rejected the key itself (401): revoked, mistyped, or
 * replaced without restarting the server. Reloading the page cannot fix it.
 */
export function isAuthError(error: unknown): boolean {
  return errorChain(error).some(({ statusCode }) => statusCode === 401)
}

/**
 * One log line for the innermost API failure, e.g. `HTTP 401: API key is
 * invalid.` The outer AppError message alone hides the reason. Only the status
 * and the provider's message are included — never headers, which carry the key.
 */
export function describeErrorCause(error: unknown): string | null {
  const chain = errorChain(error)
  const api = [...chain].reverse().find(({ statusCode }) => typeof statusCode === 'number')
  if (api) return `HTTP ${String(api.statusCode)}: ${String(api.message ?? '')}`.trim()
  const innermost = chain[chain.length - 1]
  return innermost && innermost !== error && typeof innermost.message === 'string' ? innermost.message : null
}

/** True when the model answered but the answer was unusable as structured output. */
export function isUnusableOutput(error: unknown): boolean {
  return NoOutputGeneratedError.isInstance(error) || NoObjectGeneratedError.isInstance(error)
}

/**
 * Structured output either validates or it does not. An unusable answer gets
 * exactly one more attempt; anything else (bad request, auth, a second bad
 * answer) is thrown — never patched up with regex.
 */
export async function withOneRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!isUnusableOutput(error)) throw error
    return run()
  }
}
