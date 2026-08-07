// plan catalog tests: rank ordering, limit inheritance across the tiers, and the billing interval invariants
import { expect, test } from "bun:test"
import { billingIntervals } from "./enums"
import { PLANS } from "./plans"

// each higher-ranked plan raises every numeric limit and cost over the plan below it
test("a higher-rank plan's limits are at least those of every lower-rank plan", () => {
	const { free, plus, premium } = PLANS

	// rank strictly increases free to plus to premium
	expect(free.rank).toBeLessThan(plus.rank)
	expect(plus.rank).toBeLessThan(premium.rank)

	// every flat limit only ever rises or holds as rank climbs
	for (const limitKey of ["topicLimit", "monthlyBudgetCents"] as const) {
		expect(plus[limitKey]).toBeGreaterThanOrEqual(free[limitKey])
		expect(premium[limitKey]).toBeGreaterThanOrEqual(plus[limitKey])
	}

	// a per-interval limit has to climb at each billing interval
	for (const limitKey of ["dailyTopicLimit", "dailyScanLimit"] as const) {
		for (const billingInterval of billingIntervals) {
			expect(plus[limitKey][billingInterval]).toBeGreaterThanOrEqual(free[limitKey][billingInterval])
			expect(premium[limitKey][billingInterval]).toBeGreaterThanOrEqual(plus[limitKey][billingInterval])
		}
	}
})

// every plan defines every billing interval, so a read can never land on an undefined limit
test("every plan defines both intervals for every per-billingInterval limit", () => {
	// three plans by two limits by two intervals, all of which have to be a real number
	for (const plan of Object.values(PLANS)) {
		for (const limitKey of ["dailyTopicLimit", "dailyScanLimit"] as const) {
			for (const billingInterval of billingIntervals) {
				expect(typeof plan[limitKey][billingInterval]).toBe("number")
			}
		}
	}
})

// yearly plan cannot support metered overage, so its limit is hard while monthly's is soft.
test("yearly is never the lesser billingInterval", () => {
	for (const plan of Object.values(PLANS)) {
		for (const limitKey of ["dailyTopicLimit", "dailyScanLimit"] as const) {
			expect(plan[limitKey].yearly).toBeGreaterThanOrEqual(plan[limitKey].monthly)
		}
	}
})
