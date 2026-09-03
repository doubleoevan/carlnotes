// budget-rejection tests: the shapes LiteLLM's rejection arrives in, and what must not be read as a rejection.
import { expect, test } from "bun:test"
import { isBudgetRejection } from "./models"

// the body LiteLLM answers a spent key with, as the AI sdk hands it over
const BUDGET_BODY = JSON.stringify({
	error: {
		message: "Budget has been exceeded! Key=user:reader@example.com Current cost: 3.008, Max budget: 3.0",
		type: "budget_exceeded",
		code: "429",
	},
})

// the proxy's own rejection, which arrives as a 429 naming the budget in its body
test("a spent budget is read as a budget rejection", () => {
	expect(isBudgetRejection({ statusCode: 429, responseBody: BUDGET_BODY })).toBe(true)
})

// the AI sdk retries a 429. the rejection reaches the caller wrapped in a retry error that includes each attempt
test("a rejection wrapped by the retry error is still found", () => {
	const retryError = {
		reason: "maxRetriesExceeded",
		errors: [
			{ statusCode: 429, responseBody: BUDGET_BODY },
			{ statusCode: 429, responseBody: BUDGET_BODY },
		],
	}
	expect(isBudgetRejection(retryError)).toBe(true)
	// and nested one level deeper, the way a cause chain arrives
	expect(isBudgetRejection({ cause: retryError })).toBe(true)
})

// only a budget rejection posts the spent-budget message. every other failure reports itself
test("other failures are not budget rejections", () => {
	// a rate limit is also a 429, and it says nothing about a budget
	expect(isBudgetRejection({ statusCode: 429, responseBody: '{"error":{"type":"rate_limit_exceeded"}}' })).toBe(false)
	// the budget wording on any other status is not the proxy turning the call down for spend
	expect(isBudgetRejection({ statusCode: 500, responseBody: BUDGET_BODY })).toBe(false)
	// the shapes with no status at all
	expect(isBudgetRejection(new Error("Budget has been exceeded!"))).toBe(false)
	expect(isBudgetRejection(null)).toBe(false)
	expect(isBudgetRejection(undefined)).toBe(false)
	expect(isBudgetRejection("Budget has been exceeded!")).toBe(false)
})

// an error whose cause points back at itself must not spin the chain walk
test("a self-referencing cause terminates", () => {
	const circular: { statusCode: number; cause?: unknown } = { statusCode: 500 }
	circular.cause = circular
	expect(isBudgetRejection(circular)).toBe(false)
})
