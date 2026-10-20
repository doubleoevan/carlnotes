// monthly budget cutoff tests: each cutoff at its plan's share of the budget, an admin with and without a budget
// override, and the cost of the daily scans left this month that sets the daily scans cutoff
import { expect, test } from "bun:test"
import { type MonthlyBudgetCutoffKind, toMonthlyBudgetCutoffs } from "@shared/plans"
import { ADMIN_USER_ACCESS_ROW } from "./connectionPoolStub"
import { isMonthlyBudgetCutoffPassed, toDailyScanCentsLeft } from "./monthlyBudgetCutoffs"
import { withSpendQueryRows } from "./quotaTestFixtures"

// a plus user's budget is 1500 cents, so spoken questions stop at 600 cents and podcast episodes at 1125, and at 600
// cents every later plus cutoff is still ahead. a premium user's full podcast episodes stop at 2450 of 3500. a free
// user's podcast episodes stop at 60 of 300, and a free plan has no full podcast episodes cutoff
test("each cutoff stops its kind of spend at its plan's share of the budget, and not one cent before", async () => {
	const isPassedAt = (plan: string, scanDollars: string, kind: MonthlyBudgetCutoffKind): Promise<boolean> =>
		withSpendQueryRows({ accessRow: ["user", plan, null], spendDollars: [scanDollars, "0", "0"] }, () =>
			isMonthlyBudgetCutoffPassed("user-1", kind),
		)

	// each plus cutoff at its share, a cent under and at it
	expect(await isPassedAt("plus", "5.99", "spokenQuestions")).toBe(false)
	expect(await isPassedAt("plus", "6.00", "spokenQuestions")).toBe(true)
	expect(await isPassedAt("plus", "11.24", "podcastEpisodes")).toBe(false)
	expect(await isPassedAt("plus", "11.25", "podcastEpisodes")).toBe(true)

	// the plus cutoffs past the spoken questions one are still ahead at its share
	for (const laterKind of ["fullPodcastEpisodes", "podcastEpisodes", "manualScans"] as const) {
		expect(await isPassedAt("plus", "6.00", laterKind)).toBe(false)
	}

	// premium's full podcast episodes cutoff, and the free plan's two
	expect(await isPassedAt("premium", "24.49", "fullPodcastEpisodes")).toBe(false)
	expect(await isPassedAt("premium", "24.50", "fullPodcastEpisodes")).toBe(true)
	expect(await isPassedAt("free", "0.59", "podcastEpisodes")).toBe(false)
	expect(await isPassedAt("free", "0.60", "podcastEpisodes")).toBe(true)
	expect(await isPassedAt("free", "2.99", "fullPodcastEpisodes")).toBe(false)
})

// an admin with no override spends against the admin backstop alone, and an override is a deliberate limit that brings
// back the plan's cutoffs
test("an admin with no budget override has no cutoffs, and one with an override has the plan's", async () => {
	const isManualScansPassed = (accessRow: unknown[]): Promise<boolean> =>
		withSpendQueryRows({ accessRow, spendDollars: ["950", "0", "0"] }, () =>
			isMonthlyBudgetCutoffPassed("user-1", "manualScans"),
		)
	expect(await isManualScansPassed(ADMIN_USER_ACCESS_ROW)).toBe(false)
	expect(await isManualScansPassed(["admin", "free", 100_000])).toBe(true)
})

// three daily Topics at a mean of 9 cents a scan, with twelve days left in October
test("the daily scans left this month cost each daily topic's mean scan cost for every day left", () => {
	const now = new Date("2026-10-20T00:00:00Z")
	const toDailyScanCents = (dailyTopicCount: number, recentScanCostDollars: number[]): number =>
		toDailyScanCentsLeft({ dailyTopicCount, weekdaysTopicCount: 0, recentScanCostDollars, now })
	expect(toDailyScanCents(3, [0.08, 0.1])).toBeCloseTo(324)
	expect(toDailyScanCents(1, [])).toBeCloseTo(120)
	expect(toDailyScanCents(0, [0.08])).toBe(0)
})

// three daily Topics at 8 cents a scan cost 288 cents over the twelve days left on October 20, and 168 cents over the
// seven left on October 25. a plus user's daily scans cutoff sits where the rest of the 1500 cents covers that cost
test("the daily scans cutoff covers the daily scans left this month, and moves up as the month runs out", () => {
	// the cost of the daily scans left on each day
	const toDailyScanCentsLeftOn = (now: Date): number =>
		toDailyScanCentsLeft({ dailyTopicCount: 3, weekdaysTopicCount: 0, recentScanCostDollars: [0.08], now })
	const october20DailyScanCentsLeft = toDailyScanCentsLeftOn(new Date("2026-10-20T00:00:00Z"))
	const october25DailyScanCentsLeft = toDailyScanCentsLeftOn(new Date("2026-10-25T00:00:00Z"))
	expect(october20DailyScanCentsLeft).toBeCloseTo(288)
	expect(october25DailyScanCentsLeft).toBeCloseTo(168)

	// the plus user's daily scans cutoff for each cost
	const toDailyScansBudgetShare = (dailyScanCentsLeft: number): number | undefined =>
		toMonthlyBudgetCutoffs({
			userAccess: { isAdmin: false, plan: "plus", budgetOverrideCents: null },
			dailyScanCentsLeft,
		}).find((cutoff) => cutoff.kind === "dailyScans")?.budgetShare

	// the cutoff sits at 1 - 288 / 1500 on October 20, and higher once fewer days are left
	const october20BudgetShare = toDailyScansBudgetShare(october20DailyScanCentsLeft) ?? 0
	const october25BudgetShare = toDailyScansBudgetShare(october25DailyScanCentsLeft) ?? 0
	expect(october20BudgetShare).toBeCloseTo(0.808)
	expect(october25BudgetShare).toBeCloseTo(0.888)
	expect(october25BudgetShare).toBeGreaterThan(october20BudgetShare)
})

// on Tuesday October 20, twelve days are left and nine of them are weekdays, so a weekdays Topic at 8 cents costs 72
// cents and a daily one 96. at noon on Saturday October 24 the weekdays left start on Monday the 26th: five of them
test("a weekdays Topic counts only the weekdays left this month", () => {
	const toWeekdaysScanCentsOn = (now: Date): number =>
		toDailyScanCentsLeft({ dailyTopicCount: 0, weekdaysTopicCount: 1, recentScanCostDollars: [0.08], now })
	expect(toWeekdaysScanCentsOn(new Date("2026-10-20T00:00:00Z"))).toBeCloseTo(72)
	expect(toWeekdaysScanCentsOn(new Date("2026-10-24T12:00:00Z"))).toBeCloseTo(40)

	// a daily Topic and a weekdays one add up
	expect(
		toDailyScanCentsLeft({
			dailyTopicCount: 1,
			weekdaysTopicCount: 1,
			recentScanCostDollars: [0.08],
			now: new Date("2026-10-20T00:00:00Z"),
		}),
	).toBeCloseTo(168)
})
