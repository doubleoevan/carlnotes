// how long each Scan stage may run before Temporal gives up on it
// a relative import. temporal bundles workflow code with webpack, which has no @shared alias
import { DAY_MS } from "../../shared/time"

// review is the long one, fetching and scoring every Resource that cleared the gate
export const INGEST_TIMEOUT_MS = 30 * 60 * 1000
export const REVIEW_TIMEOUT_MS = 30 * 60 * 1000
export const FINISH_TIMEOUT_MS = 2 * 60 * 1000

// how many times each stage may be attempted
export const INGEST_ATTEMPTS = 3
export const REVIEW_ATTEMPTS = 2
export const FINISH_ATTEMPTS = 3

// the longest the closing writes run across all of their attempts, once a closing Worker picks them up
const FINISH_TOTAL_TIMEOUT_MS = FINISH_TIMEOUT_MS * FINISH_ATTEMPTS

// how long a stage that waits for a shared worker slot may wait and run across every attempt: a Scan's ingest and
// review, and a Source's screen. Temporal counts each wait against this bound
export const QUEUED_STAGE_TIMEOUT_MS = DAY_MS

// how often a long stage reports that its worker is alive, and how long the server waits before calling it dead
export const HEARTBEAT_INTERVAL_MS = 30 * 1000
export const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000

// the longest a picked-up Scan may run, its ingest and review each waiting and running up to the queued stage bound,
// then the closing writes. it is what has to pass before the Scan is marked failed
export const MAX_SCAN_DURATION_MS = 2 * QUEUED_STAGE_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS

// how many times a url Source's llm-guard screen may be attempted, and the failure type that names an attempt the next
// one may pass: a rate limit, a server error, a timeout, a dropped connection, or a scanner that did not answer
export const SCREEN_ATTEMPTS = 3
export const RETRYABLE_SCREEN_FAILURE_TYPE = "TransientScreenFailure"
