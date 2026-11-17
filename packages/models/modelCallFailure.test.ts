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

test("proxy and fetch errors report only a safe reason", () => {
	// neither the response body nor an exception may disclose echoed user text
	const privateText = "private request content"
	expect(toModelCallFailure(400, privateText)).toEqual({
		outcome: "rejected",
		httpStatus: 400,
		reason: "the model proxy returned HTTP 400",
	})
	expect(toRetryableModelCallFailure(new Error(privateText))).toEqual({
		outcome: "retryable",
		httpStatus: null,
		reason: "the model request failed",
	})
})
