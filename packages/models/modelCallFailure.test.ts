// model call failure tests: how a failed call is sorted
import { expect, test } from "bun:test"
import { toModelCallFailure, toRetryableModelCallFailure } from "./modelCallFailure"

// a rate limit and a 5xx retry, a spent key budget does not, and any other rejection is final
test("a failed call is sorted into retryable, budget-spent, or rejected", () => {
	expect(toModelCallFailure(429, '{"error":"rate limit"}').outcome).toBe("retryable")
	expect(toModelCallFailure(503, "overloaded").outcome).toBe("retryable")
	expect(toModelCallFailure(429, '{"error":{"type":"budget_exceeded"}}').outcome).toBe("budget-spent")
	expect(toModelCallFailure(400, "Budget has been exceeded! Current cost: 3.1").outcome).toBe("budget-spent")
	expect(toModelCallFailure(400, "invalid voice").outcome).toBe("rejected")
})

// a thrown fetch error is always worth another attempt, with its message as the reason
test("a thrown fetch error is sorted as retryable", () => {
	expect(toRetryableModelCallFailure(new Error("socket closed"))).toEqual({
		outcome: "retryable",
		httpStatus: null,
		reason: "socket closed",
	})
})
