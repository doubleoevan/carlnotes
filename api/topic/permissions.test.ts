// permission tests for the invite-topic activation rule. the owner and public branches never reach it,
// and the audience path feeds the activation of the audience's subscription row into the same comparison
import { expect, test } from "bun:test"
import { isVisibleAfterActivation } from "./permissions"

// a subscriber sees a finding only when its scan started after their subscription activated
test("isVisibleAfterActivation opens findings from scans after the activation", () => {
	const activatedAt = new Date("2026-07-20T00:00:00.000Z")
	// a scan from before the activation stays hidden, so the back catalogue never opens
	expect(isVisibleAfterActivation(new Date("2026-07-19T00:00:00.000Z"), activatedAt)).toBe(false)
	// a scan at the exact activation instant is not after it, so it stays hidden too
	expect(isVisibleAfterActivation(new Date("2026-07-20T00:00:00.000Z"), activatedAt)).toBe(false)
	// a scan after the activation is visible
	expect(isVisibleAfterActivation(new Date("2026-07-21T00:00:00.000Z"), activatedAt)).toBe(true)
})

// with no active subscription nothing opens, which covers an invited user who has not accepted yet
test("isVisibleAfterActivation rejects a viewer with no active subscription", () => {
	expect(isVisibleAfterActivation(new Date("2026-07-21T00:00:00.000Z"), null)).toBe(false)
})
