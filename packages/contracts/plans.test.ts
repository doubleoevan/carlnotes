// plan catalog tests: rank ordering, limit inheritance across the tiers, the billing interval invariants, the
// monthly budget cutoffs, the cents conversions, and which subscriptions bill overage
import { expect, test } from "bun:test"
import { billingIntervals } from "./enums"
import {
	isOverageBillable,
	type MonthlyBudgetCutoff,
	PLANS,
	toCentsFromDollars,
	toMeanScanCents,
	toMonthlyBudgetCutoffs,
} from "./plans"

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

// a plus user on October 20 with three daily topics at about 8 cents a scan has 295 cents of daily scans left, so the
// daily scans cutoff sits at 80 percent, between the podcast episodes cutoff and the manual scans cutoff
test("the cutoffs come lowest share first, with the daily scans cutoff where the rest of the budget covers them", () => {
	const userAccess = { isAdmin: false, plan: "plus" as const, budgetOverrideCents: null }
	const monthlyBudgetCutoffs = toMonthlyBudgetCutoffs({ userAccess, dailyScanCentsLeft: 295 })
	expect(monthlyBudgetCutoffs.map((cutoff) => cutoff.kind)).toEqual([
		"spokenQuestions",
		"fullPodcastEpisodes",
		"podcastEpisodes",
		"dailyScans",
		"manualScans",
	])
	expect(monthlyBudgetCutoffs.find((cutoff) => cutoff.kind === "dailyScans")?.budgetShare).toBeCloseTo(0.803)
})

// daily scans that cost more than the whole budget run weekly from the first cent, and no daily topics means no cutoff
test("the daily scans cutoff floors at zero, and a user with no daily scans left has none", () => {
	const userAccess = { isAdmin: false, plan: "free" as const, budgetOverrideCents: null }
	const toDailyScansCutoff = (dailyScanCentsLeft: number): MonthlyBudgetCutoff | undefined =>
		toMonthlyBudgetCutoffs({ userAccess, dailyScanCentsLeft }).find((cutoff) => cutoff.kind === "dailyScans")
	expect(toDailyScansCutoff(450)?.budgetShare).toBe(0)
	expect(toDailyScansCutoff(0)).toBeUndefined()
})

// the free plan has no full podcast episodes, and an admin with no override has no cutoffs at all
test("a plan's missing cutoff is left out, and an admin with no budget override has none", () => {
	const freeKinds = toMonthlyBudgetCutoffs({
		userAccess: { isAdmin: false, plan: "free", budgetOverrideCents: null },
		dailyScanCentsLeft: 0,
	}).map((cutoff) => cutoff.kind)
	expect(freeKinds).toEqual(["spokenQuestions", "podcastEpisodes", "manualScans"])
	const adminCutoffs = toMonthlyBudgetCutoffs({
		userAccess: { isAdmin: true, plan: "free", budgetOverrideCents: null },
		dailyScanCentsLeft: 300,
	})
	expect(adminCutoffs).toEqual([])
})

// a fraction of a cent rounds to the nearest cent
test("toCentsFromDollars rounds dollars to whole cents", () => {
	expect(toCentsFromDollars(0.123456)).toBe(12)
	expect(toCentsFromDollars(1.2)).toBe(120)
})

// no recent scans have no mean, and two scans at 8 and 10 cents average 9 cents
test("toMeanScanCents averages the recent scan costs in cents", () => {
	expect(toMeanScanCents([])).toBeNull()
	expect(toMeanScanCents([0.08, 0.1])).toBeCloseTo(9)
})

// only a monthly Stripe subscription with a card bills a scan past the daily limit
test("isOverageBillable bills a monthly Stripe subscription with a card and no other", () => {
	const monthlyWithCard = { billingInterval: "monthly", hasPaymentMethod: true } as const
	expect(isOverageBillable({ ...monthlyWithCard, provider: "stripe" })).toBe(true)

	// a store subscription has no metered price, and a free user has no provider at all
	expect(isOverageBillable({ ...monthlyWithCard, provider: "app_store" })).toBe(false)
	expect(isOverageBillable({ ...monthlyWithCard, provider: "play_store" })).toBe(false)
	expect(isOverageBillable({ ...monthlyWithCard, provider: null })).toBe(false)

	// a yearly Stripe subscription has no overage price, and one without a card has nothing to charge
	expect(isOverageBillable({ provider: "stripe", billingInterval: "yearly", hasPaymentMethod: true })).toBe(false)
	expect(isOverageBillable({ provider: "stripe", billingInterval: "monthly", hasPaymentMethod: false })).toBe(false)
})
