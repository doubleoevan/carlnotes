// how long each Scan stage may run before Temporal gives up on it, and the longest a healthy Scan can therefore take.
// the workflow reads the per-stage values, and the sweep that marks a stale Scan failed derives its window from the sum.

// review is the long one, since it fetches and scores every Resource that cleared the gate.
// ingest matches it instead of being tuned separately, and the closing write is one statement
export const INGEST_TIMEOUT_MS = 30 * 60 * 1000
export const REVIEW_TIMEOUT_MS = 30 * 60 * 1000
export const FINISH_TIMEOUT_MS = 2 * 60 * 1000

// how many times each stage may be attempted. they live here beside the timeouts so that the total a stage may run,
// which the stale scan window has to clear, cannot drift from the retry policy that decides it
export const INGEST_ATTEMPTS = 3
export const REVIEW_ATTEMPTS = 2
export const FINISH_ATTEMPTS = 3

// how long each stage may run across all of its attempts, which is what bounds the stage as a whole
export const INGEST_TOTAL_TIMEOUT_MS = INGEST_TIMEOUT_MS * INGEST_ATTEMPTS
export const REVIEW_TOTAL_TIMEOUT_MS = REVIEW_TIMEOUT_MS * REVIEW_ATTEMPTS
export const FINISH_TOTAL_TIMEOUT_MS = FINISH_TIMEOUT_MS * FINISH_ATTEMPTS

// how often a long stage reports that its worker is alive, and how long the server waits before calling it dead.
// the SDK sends at most one heartbeat per minute, however often a stage reports, so the timeout has to clear that
// interval by enough that an ordinary pause in the process is not read as dead.
export const HEARTBEAT_INTERVAL_MS = 30 * 1000
export const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000

// the timeout window a Scan cannot exceed, which is what has to pass before the Scan is marked failed.
// summed across attempts instead of one attempt each, because a Scan whose stages retry legally runs that much longer
export const MAX_SCAN_DURATION_MS = INGEST_TOTAL_TIMEOUT_MS + REVIEW_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS
