// the monthly budget cutoffs: whether a user's spend has passed one, the account page's list of them, and the cost of
// the daily scans left this month that sets the daily scans cutoff
import {
	type MonthlyBudgetCutoff,
	type MonthlyBudgetCutoffKind,
	SCAN_COST_CENTS,
	toMeanScanCents,
	toMonthlyBudgetCutoffs,
	userBudgetCents,
} from "@shared/plans"
import { DAY_MS, isUtcWeekend } from "@shared/time"
import { and, desc, eq, type SQL } from "drizzle-orm"
import { db } from "."
import { loadDailyTopicsWithinLimit, loadUserAccess, monthlySpendDollars, startOfUtcDay, toSpendCents } from "./quotas"
import { scans } from "./schema/scans"

// how many of the user's latest succeeded scans that were not manual the daily scans cutoff averages the cost of
const MEAN_SCAN_COST_SCAN_COUNT = 20

/**
 * Whether the user's monthly spend has reached the cutoff where their plan stops this kind of spend. A user with no such
 * cutoff, such as an admin with no budget override, never reaches one.
 */
export async function isMonthlyBudgetCutoffPassed(userId: string, kind: MonthlyBudgetCutoffKind): Promise<boolean> {
	// only the daily scans cutoff needs the cost of the daily scans left this month
	const [userAccess, monthlySpend, dailyScanCentsLeft] = await Promise.all([
		loadUserAccess(userId),
		monthlySpendDollars(userId),
		kind === "dailyScans" ? loadDailyScanCentsLeft(userId) : 0,
	])

	// compare the month's spend with the cutoff's share of the user's budget
	const monthlyBudgetCutoff = toMonthlyBudgetCutoffs({ userAccess, dailyScanCentsLeft }).find(
		(cutoff) => cutoff.kind === kind,
	)
	return (
		monthlyBudgetCutoff !== undefined &&
		toSpendCents(monthlySpend) >= monthlyBudgetCutoff.budgetShare * userBudgetCents(userAccess)
	)
}

/**
 * Returns the user's monthly budget cutoffs, lowest share first.
 */
export async function loadMonthlyBudgetCutoffs(userId: string): Promise<MonthlyBudgetCutoff[]> {
	const [userAccess, dailyScanCentsLeft] = await Promise.all([loadUserAccess(userId), loadDailyScanCentsLeft(userId)])
	return toMonthlyBudgetCutoffs({ userAccess, dailyScanCentsLeft })
}

// the cost of the user's daily scans from now to the end of the month, at the mean cost of their latest scans that
// were not manual
async function loadDailyScanCentsLeft(userId: string): Promise<number> {
	const [dailyTopics, recentScanCostDollars] = await Promise.all([
		loadDailyTopicsWithinLimit(userId),
		loadRecentScanCostDollars({
			scanFilter: and(eq(scans.ownerId, userId), eq(scans.isManual, false)),
			scanCount: MEAN_SCAN_COST_SCAN_COUNT,
		}),
	])

	// a weekdays Topic scans only on weekdays, and every other one each day
	const weekdaysTopicCount = dailyTopics.filter((dailyTopic) => dailyTopic.frequency === "weekdays").length
	return toDailyScanCentsLeft({
		dailyTopicCount: dailyTopics.length - weekdaysTopicCount,
		weekdaysTopicCount,
		recentScanCostDollars,
		now: new Date(),
	})
}

/**
 * Returns the cost in dollars of the newest succeeded scans that match the filter, newest first.
 */
export async function loadRecentScanCostDollars({
	scanFilter,
	scanCount,
}: {
	scanFilter: SQL | undefined
	scanCount: number
}): Promise<number[]> {
	// load the newest succeeded scans, and read each stored cost as a number
	const recentScanRows = await db
		.select({ cost: scans.cost })
		.from(scans)
		.where(and(scanFilter, eq(scans.status, "succeeded")))
		.orderBy(desc(scans.startedAt))
		.limit(scanCount)
	return recentScanRows.map((scanRow) => Number(scanRow.cost))
}

/**
 * Returns the cost in cents of the daily scans left this month, for each daily Topic every day and each weekdays Topic
 * every weekday, at the mean recent scan cost or SCAN_COST_CENTS without one.
 */
export function toDailyScanCentsLeft({
	dailyTopicCount,
	weekdaysTopicCount,
	recentScanCostDollars,
	now,
}: {
	dailyTopicCount: number
	weekdaysTopicCount: number
	recentScanCostDollars: number[]
	now: Date
}): number {
	// the mean scan cost, and the days and weekdays until the month that resets the budget
	const meanScanCents = toMeanScanCents(recentScanCostDollars) ?? SCAN_COST_CENTS
	const nextMonthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
	const daysLeft = (nextMonthStartMs - now.getTime()) / DAY_MS
	const weekdaysLeft = toWeekdaysLeft(now, nextMonthStartMs)
	return (dailyTopicCount * daysLeft + weekdaysTopicCount * weekdaysLeft) * meanScanCents
}

// the weekday time from now until the end, in days, with the rest of today if today is a weekday
function toWeekdaysLeft(now: Date, endMs: number): number {
	let weekdaysLeft = 0
	for (let dayStartMs = startOfUtcDay(now).getTime(); dayStartMs < endMs; dayStartMs += DAY_MS) {
		// a weekend day adds nothing, and a weekday adds the part of it still ahead
		if (isUtcWeekend(new Date(dayStartMs))) {
			continue
		}
		weekdaysLeft += (Math.min(dayStartMs + DAY_MS, endMs) - Math.max(dayStartMs, now.getTime())) / DAY_MS
	}
	return weekdaysLeft
}
