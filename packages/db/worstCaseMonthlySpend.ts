// the parts of the worst case free-plan spend for the UTC month on the admin console: the sum of the free users' monthly
// budgets and the signups of each of the past 30 days

import type { WorstCaseMonthlySpend } from "@carlnotes/contracts/admin"
import { PLANS } from "@carlnotes/contracts/plans"
import { DAY_MS } from "@carlnotes/contracts/time"
import { and, eq, gte, ne, sql } from "drizzle-orm"
import { db } from "./index"
import { users } from "./schema/users"

// the days of signups the console reads, one count per day
const SIGNUP_DAY_COUNT = 30

/**
 * Loads the sum of the monthly budgets of the free users who are not admins, each override in place of the plan's, and
 * the signups of each of the past 30 days, today's first.
 */
export async function loadWorstCaseMonthlySpend(now = new Date()): Promise<WorstCaseMonthlySpend> {
	// the free users' budgets, and the past 30 days' signups grouped by how many 24-hour days ago each came, at once.
	// the time goes as a UTC timestamp, the way the timestamp columns store it
	const signupDaysAgo = sql<number>`floor(extract(epoch from (${now.toISOString()}::timestamp - ${users.createdAt})) / ${DAY_MS / 1000})::int`
	const [[freeUserRow], signupDayRows] = await Promise.all([
		db
			.select({
				budgetCents: sql<string>`coalesce(sum(coalesce(${users.budgetOverrideCents}, ${PLANS.free.monthlyBudgetCents})), 0)`,
			})
			.from(users)
			.where(and(eq(users.plan, "free"), ne(users.role, "admin"))),
		db
			.select({ daysAgo: signupDaysAgo, signupCount: sql<number>`count(*)::int` })
			.from(users)
			.where(gte(users.createdAt, new Date(now.getTime() - SIGNUP_DAY_COUNT * DAY_MS)))
			// group by the first column. a repeated days-ago expression would send its own parameters
			.groupBy(sql`1`),
	])

	// one count per day, zero for a day without signups
	const dailySignupCounts = Array.from({ length: SIGNUP_DAY_COUNT }, () => 0)
	for (const { daysAgo, signupCount } of signupDayRows) {
		if (daysAgo >= 0 && daysAgo < SIGNUP_DAY_COUNT) {
			dailySignupCounts[daysAgo] = Number(signupCount)
		}
	}
	return { freeUserBudgetCents: Number(freeUserRow?.budgetCents ?? 0), dailySignupCounts }
}
