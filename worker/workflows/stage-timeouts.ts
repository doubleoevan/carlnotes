// how long each Scan stage may run before Temporal gives up on it, and the longest a healthy Scan can therefore take.
// the workflow reads the per-stage values and the reclaim derives its timeout window from the sum.

// review is the long one, since it fetches and scores every Resource that cleared the gate.
// ingest matches it instead of being tuned separately, and the closing write is one statement
export const INGEST_TIMEOUT_MS = 30 * 60 * 1000
export const REVIEW_TIMEOUT_MS = 30 * 60 * 1000
export const FINISH_TIMEOUT_MS = 2 * 60 * 1000

// the timeout window a Scan cannot exceed, which is what has to clear before the scan is reclaimed
export const MAX_SCAN_DURATION_MS = INGEST_TIMEOUT_MS + REVIEW_TIMEOUT_MS + FINISH_TIMEOUT_MS
