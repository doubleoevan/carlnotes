// how long each Scan stage may run before Temporal gives up on it

// review is the long one, fetching and scoring every Resource that cleared the gate
export const INGEST_TIMEOUT_MS = 30 * 60 * 1000
export const REVIEW_TIMEOUT_MS = 30 * 60 * 1000
export const FINISH_TIMEOUT_MS = 2 * 60 * 1000

// how many times each stage may be attempted
export const INGEST_ATTEMPTS = 3
export const REVIEW_ATTEMPTS = 2
export const FINISH_ATTEMPTS = 3

// how long each stage may run across all of its attempts, which is what bounds the stage as a whole
export const INGEST_TOTAL_TIMEOUT_MS = INGEST_TIMEOUT_MS * INGEST_ATTEMPTS
export const REVIEW_TOTAL_TIMEOUT_MS = REVIEW_TIMEOUT_MS * REVIEW_ATTEMPTS
export const FINISH_TOTAL_TIMEOUT_MS = FINISH_TIMEOUT_MS * FINISH_ATTEMPTS

// how often a long stage reports that its worker is alive, and how long the server waits before calling it dead
export const HEARTBEAT_INTERVAL_MS = 30 * 1000
export const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000

// the timeout window a Scan cannot exceed, which is what has to pass before the Scan is marked failed
export const MAX_SCAN_DURATION_MS = INGEST_TOTAL_TIMEOUT_MS + REVIEW_TOTAL_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS
