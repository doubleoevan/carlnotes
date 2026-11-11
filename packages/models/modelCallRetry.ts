// the runner a Scan's model calls go through: a rate limit, an overloaded or failing provider, or a timeout waits and
// tries again, within limits that fit inside one review attempt, and every other failure ends the call at once

import { runWithRetries } from "@carlnotes/server/retry"
import { APICallError, NoObjectGeneratedError } from "ai"
import { toModelCallFailure } from "./modelCallFailure"
import { isBudgetRejection, toErrorCauses } from "./models"

// how many attempts one call makes, the longest single wait, and the longest total wait across the call
const MODEL_CALL_ATTEMPTS = 5
const MAX_MODEL_CALL_WAIT_MS = 30_000
const MAX_MODEL_CALL_TOTAL_WAIT_MS = 60_000

// how long a call may have run before it starts no new attempt. a timed-out premium attempt runs past it
const MAX_MODEL_CALL_ELAPSED_MS = 3 * 60 * 1000

// the first backoff wait if the response names none. each later wait doubles, up to the longest single wait
const MODEL_CALL_BACKOFF_MS = 4000

// the most jitter a wait that a response named gets on top, as a share of that wait. calls that one rate limit
// failed together then try again spread apart
const RETRY_AFTER_JITTER_SHARE = 0.2

// the response headers that name a wait, in the order they are read. LiteLLM forwards a provider's own header
// unchanged or under the llm_provider- prefix
const RETRY_AFTER_HEADERS = [
	{ headerName: "retry-after-ms", unitMs: 1 },
	{ headerName: "retry-after", unitMs: 1000 },
	{ headerName: "llm_provider-retry-after-ms", unitMs: 1 },
	{ headerName: "llm_provider-retry-after", unitMs: 1000 },
] as const

// the model calls the runner covers, as each names itself in its retry log line
type ModelCallLabel = "scoringCheap" | "scoringPremium" | "embedding" | "scan-report"

// one call's attempt, the moment after which no wait may end, the label it logs, and whether it reviews private text
type RunModelCallOptions<Result> = {
	runAttempt: () => Promise<Result>
	waitDeadlineAt: number | null
	label: ModelCallLabel
	isPrivate?: boolean
}

// a wait a response named, and the header that named it
type RetryAfter = { headerName: string; delayMs: number }

/**
 * Runs a model call, waiting and trying again after a failure that another attempt can fix, and returns its result.
 */
export async function runModelCall<Result>({
	runAttempt,
	waitDeadlineAt,
	label,
	isPrivate = false,
}: RunModelCallOptions<Result>): Promise<Result> {
	// the moment the call started and the waits it has spent, which bound every later wait
	const startedAt = Date.now()
	let waitedMs = 0

	// ponytail: each call waits on its own. a token bucket per model alias, shared in Redis, would lower the
	// replicas' request rate together if the retry log shows waits outlasting the total wait often
	return runWithRetries({
		attempts: MODEL_CALL_ATTEMPTS,
		runAttempt,
		isRetryable: isRetryableModelCallError,
		// each wait counts toward the call's total wait
		toDelayMs: (error, attempt) => {
			const delayMs = toModelCallDelayMs({ error, attempt, startedAt, waitedMs, waitDeadlineAt })
			waitedMs += delayMs ?? 0
			return delayMs
		},
		onRetry: (attempt, error, delayMs) => logModelCallRetry({ label, isPrivate, attempt, error, delayMs }),
	})
}

/**
 * Returns whether a failed model call is worth another attempt: a rate limit, a 408, a 5xx, a timeout, or a dropped
 * connection, and never a spent budget, another rejection, or a model output that fails its schema.
 */
export function isRetryableModelCallError(error: unknown): boolean {
	// a spent budget and an output that fails its schema end the call
	if (isBudgetRejection(error) || NoObjectGeneratedError.isInstance(error)) {
		return false
	}

	// a response's status decides
	const apiCallError = findApiCallError(error)
	if (apiCallError) {
		return isRetryableApiCallError(apiCallError)
	}

	// a call that never reached a response is retryable if it timed out or was aborted
	return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
}

// whether a call error is worth another attempt. one with no error status is a connection the SDK already judged,
// such as a body that dropped after a 200
function isRetryableApiCallError(apiCallError: APICallError): boolean {
	if (apiCallError.statusCode === undefined || apiCallError.statusCode < 400) {
		return apiCallError.isRetryable
	}

	// a 408 is a proxy timeout. otherwise a rate limit or a 5xx is worth another attempt
	if (apiCallError.statusCode === 408) {
		return true
	}
	return toModelCallFailure(apiCallError.statusCode, apiCallError.responseBody ?? "").outcome === "retryable"
}

/**
 * Returns the backoff wait before the attempt after the given one: doubling from the first wait up to the longest
 * single wait, scaled by a random 50 to 100 percent.
 */
export function toModelCallBackoffMs(attempt: number, random: () => number = Math.random): number {
	const backoffMs = Math.min(MODEL_CALL_BACKOFF_MS * 2 ** (attempt - 1), MAX_MODEL_CALL_WAIT_MS)
	return Math.round(backoffMs * (0.5 + random() / 2))
}

/**
 * Returns the wait before the next attempt for a wait a response named: that wait plus a random 0 to 20 percent,
 * never past the longest single wait.
 */
export function toRetryAfterWaitMs(retryAfterMs: number, random: () => number = Math.random): number {
	return Math.min(Math.round(retryAfterMs * (1 + random() * RETRY_AFTER_JITTER_SHARE)), MAX_MODEL_CALL_WAIT_MS)
}

// the failure, the attempt that failed, when the call started, what it has waited, and the review's wait deadline
type ToModelCallDelayMsOptions = {
	error: unknown
	attempt: number
	startedAt: number
	waitedMs: number
	waitDeadlineAt: number | null
}

// the wait before the next attempt, or null if that wait passes a limit and the call should fail now
function toModelCallDelayMs({
	error,
	attempt,
	startedAt,
	waitedMs,
	waitDeadlineAt,
}: ToModelCallDelayMsOptions): number | null {
	// a response that asks for more than the single wait limit fails the call now
	const retryAfterMs = readRetryAfter(error)?.delayMs
	if (retryAfterMs !== undefined && retryAfterMs > MAX_MODEL_CALL_WAIT_MS) {
		return null
	}

	// the response's own wait with jitter on top, else the backoff. a wait past the call's total wait fails the call now
	const delayMs = retryAfterMs === undefined ? toModelCallBackoffMs(attempt) : toRetryAfterWaitMs(retryAfterMs)
	if (waitedMs + delayMs > MAX_MODEL_CALL_TOTAL_WAIT_MS) {
		return null
	}

	// an attempt that would start past the elapsed limit or the review's wait deadline is not started
	const nextAttemptAt = Date.now() + delayMs
	const isPastElapsedLimit = nextAttemptAt - startedAt > MAX_MODEL_CALL_ELAPSED_MS
	const isPastWaitDeadline = waitDeadlineAt !== null && nextAttemptAt > waitDeadlineAt
	return isPastElapsedLimit || isPastWaitDeadline ? null : delayMs
}

// the wait the failed response's headers name, from the first header that holds a readable wait, or null
function readRetryAfter(error: unknown): RetryAfter | null {
	// read the headers of the call error, wherever the chain holds it
	const responseHeaders = findApiCallError(error)?.responseHeaders
	if (!responseHeaders) {
		return null
	}

	// a header holds a number in its unit, or a retry-after holds an http date
	for (const { headerName, unitMs } of RETRY_AFTER_HEADERS) {
		const headerValue = responseHeaders[headerName]
		const delayMs = headerValue ? toRetryAfterDelayMs(headerValue, unitMs) : null
		if (delayMs !== null) {
			return { headerName, delayMs }
		}
	}

	// no header names a wait
	return null
}

// one header's wait in milliseconds, at least zero, or null if the value is neither a number nor a date
function toRetryAfterDelayMs(headerValue: string, unitMs: number): number | null {
	// a number counts in the header's own unit
	const headerNumber = Number(headerValue)
	if (Number.isFinite(headerNumber)) {
		return Math.max(0, Math.round(headerNumber * unitMs))
	}

	// a seconds header may name an http date instead
	const retryAt = Date.parse(headerValue)
	if (unitMs === 1 || Number.isNaN(retryAt)) {
		return null
	}
	return Math.max(0, retryAt - Date.now())
}

// the AI SDK's call error, wherever the error chain holds it
function findApiCallError(error: unknown): APICallError | undefined {
	return toErrorCauses(error).find((errorCause): errorCause is APICallError => APICallError.isInstance(errorCause))
}

// the call's label, whether it reviews private text, the attempt that failed, its failure, and the wait before the next
type LogModelCallRetryOptions = {
	label: ModelCallLabel
	isPrivate: boolean
	attempt: number
	error: unknown
	delayMs: number
}

// log one retry with its label, attempt, and wait. a public call adds its status and the header that named the wait
function logModelCallRetry({ label, isPrivate, attempt, error, delayMs }: LogModelCallRetryOptions): void {
	// a private call logs its label and numbers alone
	if (isPrivate) {
		console.warn(`model call ${label} attempt ${attempt} failed, trying again in ${delayMs} ms`)
		return
	}

	// a public call names the status and where the wait came from
	const statusCode = findApiCallError(error)?.statusCode ?? "none"
	const retryAfterHeader = readRetryAfter(error)?.headerName ?? "backoff"
	console.warn(
		`model call ${label} attempt ${attempt} failed with status ${statusCode}, trying again in ${delayMs} ms from ${retryAfterHeader}`,
	)
}
