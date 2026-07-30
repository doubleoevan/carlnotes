// plan catalog tests: rank ordering and limit inheritance across the tiers
import { expect, test } from "bun:test"
import { PLANS } from "./plans"

// each higher-ranked plan raises every numeric limit and cost over the plan below it
test("a higher-rank plan's limits are at least those of every lower-rank plan", () => {
	const { free, plus, premium } = PLANS

	// rank strictly increases free to plus to premium
	expect(free.rank).toBeLessThan(plus.rank)
	expect(plus.rank).toBeLessThan(premium.rank)

	// every numeric limit only ever rises or holds as rank climbs
	for (const limitKey of ["topicLimit", "dailyScanLimit", "monthlyBudgetCents"] as const) {
		expect(plus[limitKey]).toBeGreaterThanOrEqual(free[limitKey])
		expect(premium[limitKey]).toBeGreaterThanOrEqual(plus[limitKey])
	}
})
