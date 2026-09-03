// scan failure tests: what a stored reason reads as, and that the real cause survives Temporal's wrapper.
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isBudgetError, toScanFailureLabel, toScanFailureReason } from "./scanFailure"

// the proxy's rejection, as it reaches the workflow: wrapped by the AI sdk's retry and then by temporal
function temporalFailure(): Error {
	const budgetError = new Error(
		"AI_APICallError: Budget has been exceeded! Key=user:reader@example.com Current cost: 3.008, Max budget: 3.0",
	)
	const retryError = new Error("Failed after 3 attempts. Last error: Budget has been exceeded!", { cause: budgetError })
	// temporal's own failure says only that an activity failed, with the real reason one level down
	return new Error("Activity task failed", { cause: retryError })
}

/**
 * Temporal's outer message is "Activity task failed" on every failed scan, which no budget rule can match.
 * The reason has to come from the cause chain instead.
 */
test("the stored reason comes from the cause, not temporal's wrapper", () => {
	const reason = toScanFailureReason(temporalFailure())
	expect(reason).toContain("Budget has been exceeded")
	expect(reason).not.toBe("Activity task failed")

	// and that reason is what turns the scan into a budget failure the user can act on
	expect(isBudgetError(reason)).toBe(true)
	expect(toScanFailureLabel(reason)).toBe("Carl hit this month's budget.")
	// temporal's own message is not a budget failure
	expect(isBudgetError("Activity task failed")).toBe(false)
})

// a failure with nothing wrapped keeps its own message
test("an unwrapped failure keeps its message", () => {
	expect(toScanFailureReason(new Error("every source rejected"))).toBe("every source rejected")
	expect(toScanFailureReason("a plain string")).toBe("a plain string")
})

// a cause that points back at itself must not spin the walk
test("a self-referencing cause terminates", () => {
	const circular: Error & { cause?: unknown } = new Error("the outer one")
	circular.cause = circular
	expect(toScanFailureReason(circular)).toBe("the outer one")
})

/**
 * A budget rejection mid-scan ends the whole Scan, and the stored reason names the budget.
 */
test("a budget rejection ends the scan, not one resource", () => {
	const scoreSource = readFileSync(join(import.meta.dir, "..", "worker", "review", "score.ts"), "utf8")
	// the per-resource catch lets a budget rejection through instead of marking that one resource failed
	expect(scoreSource).toContain("isBudgetRejection")
	expect(scoreSource).toContain("throw error")

	// and the reason that reaches the user is the budget one, with a way out of it
	const budgetReason = "Budget has been exceeded! Current cost: 3.008, Max budget: 3.0"
	expect(
		isBudgetError(toScanFailureReason(new Error("Activity task failed", { cause: new Error(budgetReason) }))),
	).toBe(true)
})
