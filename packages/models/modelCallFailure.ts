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
	// LiteLLM names a spent key budget in the body, on a 429 or a 400. mask a key that the body echoes
	const reason = errorBody.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").slice(0, 500)
	if (isBudgetExhaustedBody(errorBody)) {
		return { outcome: "budget-spent", reason }
	}

	// a rate limit and an overloaded or failing server are worth another attempt
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
	return { outcome: "retryable", httpStatus: null, reason: error instanceof Error ? error.message : String(error) }
}
