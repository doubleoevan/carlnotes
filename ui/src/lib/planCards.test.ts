// pricing plan identity: which plan the user is on, and which badge displays on the pricing page cards
import { describe, expect, it } from "bun:test"
import { isUsersPlan, toPlanBadge } from "./planCards"

describe("isUsersPlan", () => {
	it("matches the user's plan at the interval they bill on", () => {
		expect(isUsersPlan("premium", "premium", "yearly", "yearly")).toBe(true)
		expect(isUsersPlan("premium", "premium", "monthly", "monthly")).toBe(true)
	})

	it("does not match the same plan at the other interval", () => {
		expect(isUsersPlan("premium", "premium", "monthly", "yearly")).toBe(false)
		expect(isUsersPlan("premium", "premium", "yearly", "monthly")).toBe(false)
	})

	it("matches free at either interval, since free bills on no frequency", () => {
		expect(isUsersPlan("free", "free", "monthly", null)).toBe(true)
		expect(isUsersPlan("free", "free", "yearly", null)).toBe(true)
	})

	it("does not match another plan, or any plan for a visitor", () => {
		expect(isUsersPlan("plus", "premium", "monthly", "monthly")).toBe(false)
		expect(isUsersPlan("plus", null, "monthly", null)).toBe(false)
	})
})

describe("toPlanBadge", () => {
	it("badges the user's own subscription", () => {
		expect(toPlanBadge(true, "premium", true)).toBe("Current plan")
	})

	it("recommends only to a visitor, and only on the highlighted card", () => {
		expect(toPlanBadge(false, null, true)).toBe("Recommended")
		expect(toPlanBadge(false, null, false)).toBeNull()
	})

	it("leaves a signed-in user's other cards unbadged, highlighted or not", () => {
		expect(toPlanBadge(false, "premium", true)).toBeNull()
		expect(toPlanBadge(false, "free", false)).toBeNull()
	})
})
