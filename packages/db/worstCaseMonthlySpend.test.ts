// the parts of the worst case monthly spend: the free users' budgets and the signups of each of the past 30 days

import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { loadWorstCaseMonthlySpend } from "./worstCaseMonthlySpend"

afterEach(() => {
	restoreConnectionPool()
})

test("reads the free users' budgets and one signup count for each of the past 30 days", async () => {
	// 45 dollars of budgets, 4 signups today, 2 three days ago, and a row out of range that is left out
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes("sum(coalesce(")
			? [["4500"]]
			: [
					[0, 4],
					[3, 2],
					[30, 9],
				],
	)
	const worstCaseMonthlySpend = await loadWorstCaseMonthlySpend(new Date(Date.UTC(2026, 10, 11, 12)))

	// the budgets and a count per day, today's first
	const expectedDailySignupCounts = Array.from({ length: 30 }, () => 0)
	expectedDailySignupCounts[0] = 4
	expectedDailySignupCounts[3] = 2
	expect(worstCaseMonthlySpend).toEqual({ freeUserBudgetCents: 4_500, dailySignupCounts: expectedDailySignupCounts })

	// the budgets count only the free users who are not admins
	const freeUserQuery = sentQueries.find(({ text }) => text.includes("sum(coalesce("))
	expect(freeUserQuery?.values).toEqual(expect.arrayContaining(["free", "admin"]))
})

test("reads no budget and 30 empty days on an empty users table", async () => {
	// no free users and no recent signups
	stubConnectionPool(({ text }) => (text.includes("sum(coalesce(") ? [["0"]] : []))
	const worstCaseMonthlySpend = await loadWorstCaseMonthlySpend()
	expect(worstCaseMonthlySpend).toEqual({
		freeUserBudgetCents: 0,
		dailySignupCounts: Array.from({ length: 30 }, () => 0),
	})
})
