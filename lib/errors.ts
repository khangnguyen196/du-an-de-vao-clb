export const ERROR_CODES = {
  INVALID_URL: 'INVALID_URL',
  UNSUPPORTED_SOURCE: 'UNSUPPORTED_SOURCE',
  YOUTUBE_BLOCKED: 'YOUTUBE_BLOCKED',
  VIDEO_UNAVAILABLE: 'VIDEO_UNAVAILABLE',
  VIDEO_PRIVATE: 'VIDEO_PRIVATE',
  AGE_RESTRICTED: 'AGE_RESTRICTED',
  LIVE_STREAM: 'LIVE_STREAM',
  NO_CAPTIONS: 'NO_CAPTIONS',
  CAPTIONS_EMPTY: 'CAPTIONS_EMPTY',
  UPSTREAM_BLOCKED: 'UPSTREAM_BLOCKED',
  UPSTREAM_FAILED: 'UPSTREAM_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_FAILED: 'AI_FAILED',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_SOURCE: 400,
  YOUTUBE_BLOCKED: 422,
  VIDEO_UNAVAILABLE: 404,
  VIDEO_PRIVATE: 403,
  AGE_RESTRICTED: 403,
  LIVE_STREAM: 422,
  NO_CAPTIONS: 422,
  CAPTIONS_EMPTY: 422,
  UPSTREAM_BLOCKED: 502,
  UPSTREAM_FAILED: 502,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  AI_FAILED: 502,
  INTERNAL: 500,
}

/**
 * Every thrown error in this app carries a machine-readable `code` so the UI
 * can show the real reason instead of a generic failure. Never throw strings.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message?: string, options?: { cause?: unknown; status?: number }) {
    super(message ?? code, { cause: options?.cause })
    this.name = 'AppError'
    this.code = code
    this.status = options?.status ?? DEFAULT_STATUS[code]
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  return new AppError(ERROR_CODES.INTERNAL, 'Unexpected error', { cause: error })
}
