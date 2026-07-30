// scan failure label tests: budget-wall detection and the reader-facing failure line
import { expect, test } from "bun:test"
import { isBudgetError, toScanFailureLabel } from "./scanFailure"

// the litellm spend-ceiling error counts as a budget failure. anything else does not
test("isBudgetError matches the litellm spend-ceiling error", () => {
	expect(isBudgetError("AI_APICallError: Budget has been exceeded! Current cost: 3.003, Max budget: 3.0")).toBe(true)
	expect(isBudgetError("scan stopped responding and was closed out")).toBe(false)
	expect(isBudgetError(null)).toBe(false)
})

// a stored failure renders as plain words, never the raw retry wrapper or provider class name
test("toScanFailureLabel humanizes known failures and strips wrapper noise", () => {
	// the budget wall reads as a bare fact, since the caller follows it with an inline upgrade link
	const budgetError =
		"Failed after 3 attempts. Last error: AI_APICallError: Budget has been exceeded! Current cost: 3.003135784000001, Max budget: 3.0"
	expect(toScanFailureLabel(budgetError)).toBe("Carl hit this month's budget.")
	// the retry wrapper and error class fall away, keeping the reason itself
	expect(toScanFailureLabel("Failed after 3 attempts. Last error: AI_APICallError: connection refused")).toBe(
		"connection refused",
	)
	// a reason recorded in plain words already passes through untouched
	expect(toScanFailureLabel("scan stopped responding and was closed out")).toBe(
		"scan stopped responding and was closed out",
	)
	expect(toScanFailureLabel(null)).toBe("This one didn't brew.")
})
