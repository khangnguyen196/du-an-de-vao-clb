import type { ErrorCode } from '@/lib/errors'

/**
 * Window events between the account stores and whoever shows their state.
 * Kept apart from the stores so listening for them loads nothing heavy.
 */

/** A save or read did not reach the account. */
export const SYNC_ERROR_EVENT = 'abc:sync-error'
/** Data reached the account from elsewhere on the page (the import), so every list re-reads it. */
export const STUDY_CHANGED_EVENT = 'abc:study-changed'

export interface SyncErrorDetail {
  code: ErrorCode
}
