// admin tests for the contribution math the that totals summary reports
import { expect, test } from "bun:test"
import { computeContributionCents, isSelfDemotion } from "./admin"

// contribution is net revenue minus tracked variable cost minus the optional fixed-cost constant
test("computeContributionCents nets revenue against tracked cost and the fixed constant", () => {
	// revenue over cost yields a positive contribution. the fixed constant lowers it further
	expect(computeContributionCents(10_000, 3_000, 0)).toBe(7_000)
	expect(computeContributionCents(10_000, 3_000, 2_000)).toBe(5_000)
	// a negative result is preserved, not floored. tracked cost can exceed revenue
	expect(computeContributionCents(1_000, 3_000, 0)).toBe(-2_000)
})

// contribution is unavailable when Stripe net revenue could not be read
test("computeContributionCents is null when revenue is unavailable", () => {
	expect(computeContributionCents(null, 3_000, 0)).toBeNull()
})

// an admin removing their own admin role is refused, so the platform can never be locked out of its last admin
test("isSelfDemotion refuses an admin demoting themselves, and nothing else", () => {
	expect(isSelfDemotion("u1", "u1", "user")).toBe(true)
	// promoting yourself and changing someone else's role are both fine
	expect(isSelfDemotion("u1", "u1", "admin")).toBe(false)
	expect(isSelfDemotion("u1", "u2", "user")).toBe(false)
	expect(isSelfDemotion("u1", "u2", "admin")).toBe(false)
})
