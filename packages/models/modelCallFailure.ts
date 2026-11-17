// the ways a model call through the proxy fails, and how a failure is sorted into one

import { isRetryableHttpStatus } from "@carlnotes/server/publicFetch"

// how a model call through the proxy fails
export type ModelCallFailure =
	// a failure that a retry can fix. a rate limit, a 5xx, a response with no result, a timeout, or a network failure
	| { outcome: "retryable"; httpStatus: number | null; reason: string }
	// the key's budget is spent, and no retry this month can fix a spent budget
	| { outcome: "budget-spent"; reason: string }
	// any other rejection
	| { outcome: "rejected"; httpStatus: number | null; reason: string }

/**
 * Sorts a failed model call into a spent key budget, a failure that another attempt can fix, or a rejection.
 */
export function toModelCallFailure(httpStatus: number, errorBody: string): ModelCallFailure {
	// use the body only to classify budget failures. a provider can echo request content
	if (isBudgetExhaustedBody(errorBody)) {
		return { outcome: "budget-spent", reason: "the model key's budget has been spent" }
	}

	// a rate limit and an overloaded or failing server are worth another attempt
	const reason = `the model proxy returned HTTP ${httpStatus}`
	if (isRetryableHttpStatus(httpStatus)) {
		return { outcome: "retryable", httpStatus, reason }
	}
	return { outcome: "rejected", httpStatus, reason }
}

/**
 * Returns whether a proxy response body names a spent key budget.
 */
export function isBudgetExhaustedBody(errorBody: string): boolean {
	return errorBody.includes("budget_exceeded") || errorBody.includes("Budget has been exceeded")
}

/**
 * Sorts a thrown fetch error, a timeout or a network failure, into a failure that another attempt can fix.
 */
export function toRetryableModelCallFailure(error: unknown): ModelCallFailure {
	const reason =
		error instanceof Error && error.name === "TimeoutError" ? "the model request timed out" : "the model request failed"
	return { outcome: "retryable", httpStatus: null, reason }
}
