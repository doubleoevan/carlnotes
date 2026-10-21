// scan failure tests on the pipeline: a budget rejection ends the Scan, and an activity's application failure is read
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isBudgetError, toActivityApplicationFailure, toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import { ApplicationFailure } from "@temporalio/client"

/**
 * A budget rejection mid-scan ends the whole Scan, and the stored reason names the budget.
 */
test("a budget rejection ends the scan, not one resource", () => {
	const scoreSource = readFileSync(join(import.meta.dir, "review", "score.ts"), "utf8")
	// the per-resource catch lets a budget rejection through instead of marking that one resource failed
	expect(scoreSource).toContain("isBudgetRejection")
	expect(scoreSource).toContain("throw error")

	// and the reason that reaches the user is the budget one, with a way out of it
	const budgetReason = "Budget has been exceeded! Current cost: 3.008, Max budget: 3.0"
	expect(
		isBudgetError(toWorkflowFailureReason(new Error("Activity task failed", { cause: new Error(budgetReason) }))),
	).toBe(true)
})

// an activity failure that wraps an application failure returns its type and details, and any other failure returns null
test("an activity's application failure is read from the activity failure that wraps it", () => {
	// a wrapped Resend rejection returns its type and details
	const resendRejection = ApplicationFailure.create({ type: "ResendFailure", details: [{ httpStatus: 422 }] })
	expect(toActivityApplicationFailure(new Error("Activity task failed", { cause: resendRejection }))).toEqual({
		type: "ResendFailure",
		details: [{ httpStatus: 422 }],
	})

	// a wrapped plain error and a string are not application failures
	expect(toActivityApplicationFailure(new Error("Activity task failed", { cause: new Error("socket hang up") }))).toBe(
		null,
	)
	expect(toActivityApplicationFailure("a plain string")).toBe(null)
})
