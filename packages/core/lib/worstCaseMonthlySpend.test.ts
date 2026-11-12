import { expect, test } from "bun:test"
import {
	toCutoffMonthlySpendCents,
	toCutoffPassDurationLabel,
	toDailySignupAverage,
	toPerDaySpendCents,
	toWorstCaseMonthlySpendCents,
} from "./worstCaseMonthlySpend"

// 45 dollars of free users' budgets, 4 signups today and 2 three days ago
const WORST_CASE_MONTHLY_SPEND = { freeUserBudgetCents: 4_500, dailySignupCounts: [4, 0, 0, 2, 0, 0, 0] }

test("adds the free budget of each signup a daily rate brings in the days left", () => {
	// 19 and a half days are left at noon on November 11, so 2 signups a day bring 39 at 2 dollars each
	const now = Date.UTC(2026, 10, 11, 12)
	expect(
		toWorstCaseMonthlySpendCents({ worstCaseMonthlySpend: WORST_CASE_MONTHLY_SPEND, dailySignupRate: 2, now }),
	).toBe(4_500 + 39 * 200)

	// no signups leaves the free users' budgets alone
	expect(
		toWorstCaseMonthlySpendCents({ worstCaseMonthlySpend: WORST_CASE_MONTHLY_SPEND, dailySignupRate: 0, now }),
	).toBe(4_500)
})

test("averages the signups of the past days", () => {
	// today alone, the past 4 days, the whole week, and no days
	const { dailySignupCounts } = WORST_CASE_MONTHLY_SPEND
	expect(toDailySignupAverage(dailySignupCounts, 1)).toBe(4)
	expect(toDailySignupAverage(dailySignupCounts, 4)).toBe(1.5)
	expect(toDailySignupAverage(dailySignupCounts, 7)).toBeCloseTo(6 / 7)
	expect(toDailySignupAverage(dailySignupCounts, 0)).toBe(0)
})

test("spreads a monthly spend over the days left, at least one", () => {
	// 19 and a half days left at noon on November 11, and an hour left on November 30
	expect(toPerDaySpendCents(19_500, Date.UTC(2026, 10, 11, 12))).toBe(1_000)
	expect(toPerDaySpendCents(19_500, Date.UTC(2026, 10, 30, 23))).toBe(19_500)
})

test("an even day's spend passes a cutoff at its share of the UTC day", () => {
	// $65 of $260 a day is a quarter of the day, $100 of $160 is five eighths, and $65 of $66 is near midnight
	expect(toCutoffPassDurationLabel({ cutoffCents: 6_500, perDaySpendCents: 26_000 })).toBe("6h 0m")
	expect(toCutoffPassDurationLabel({ cutoffCents: 10_000, perDaySpendCents: 16_000 })).toBe("15h 0m")
	expect(toCutoffPassDurationLabel({ cutoffCents: 6_500, perDaySpendCents: 6_600 })).toBe("23h 38m")

	// $65 of $3,000 a day passes in under an hour, and $65 of $1,000,000 in under a minute
	expect(toCutoffPassDurationLabel({ cutoffCents: 6_500, perDaySpendCents: 300_000 })).toBe("31m")
	expect(toCutoffPassDurationLabel({ cutoffCents: 6_500, perDaySpendCents: 100_000_000 })).toBe("0m")
})

test("a day's spend at or under a cutoff never passes it", () => {
	expect(toCutoffPassDurationLabel({ cutoffCents: 6_500, perDaySpendCents: 6_500 })).toBeNull()
	expect(toCutoffPassDurationLabel({ cutoffCents: 6_500, perDaySpendCents: 1_900 })).toBeNull()
})

test("the highest cutoff limits each day left of a monthly spend", () => {
	// 19 and a half days left at noon on November 11, so a $150 cutoff limits the month to $2,925
	const now = Date.UTC(2026, 10, 11, 12)
	expect(toCutoffMonthlySpendCents({ monthlySpendCents: 5_000_000, highestCutoffCents: 15_000, now })).toBe(292_500)

	// a month under the cutoff keeps its spend, and the last hour of the month counts as one day
	expect(toCutoffMonthlySpendCents({ monthlySpendCents: 19_500, highestCutoffCents: 15_000, now })).toBe(19_500)
	expect(
		toCutoffMonthlySpendCents({
			monthlySpendCents: 5_000_000,
			highestCutoffCents: 15_000,
			now: Date.UTC(2026, 10, 30, 23),
		}),
	).toBe(15_000)
})
