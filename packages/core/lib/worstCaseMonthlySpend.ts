// the worst case free-plan spend for the UTC month at a daily signup rate, and the rates the admin console compares

import type { WorstCaseMonthlySpend } from "@carlnotes/contracts/admin"
import { PLANS } from "@carlnotes/contracts/plans"
import { DAY_MS } from "@carlnotes/contracts/time"
import { toHoursMinutesLabel, toUtcMonthReset } from "./utcResets"

// the daily signup rates the admin console's table compares with the current one
export const DAILY_SIGNUP_RATES = [10, 100, 1_000, 10_000]

type ToWorstCaseMonthlySpendCentsOptions = {
	worstCaseMonthlySpend: WorstCaseMonthlySpend
	dailySignupRate: number
	now: number
}

/**
 * Returns the worst case free-plan spend for the UTC month in cents: every free user's whole monthly budget, and the
 * free plan's budget for each signup the daily rate brings before the first of the next UTC month.
 */
export function toWorstCaseMonthlySpendCents({
	worstCaseMonthlySpend,
	dailySignupRate,
	now,
}: ToWorstCaseMonthlySpendCentsOptions): number {
	// the signups the rate brings in the days left, each with the free plan's budget
	const daysLeft = toUtcMonthDaysLeft(now)
	const expectedSignupCount = Math.round(dailySignupRate * daysLeft)
	return worstCaseMonthlySpend.freeUserBudgetCents + expectedSignupCount * PLANS.free.monthlyBudgetCents
}

/**
 * Returns the daily signup average over the past days, from the signup counts with today's first.
 */
export function toDailySignupAverage(dailySignupCounts: number[], dayCount: number): number {
	const pastSignupCounts = dailySignupCounts.slice(0, dayCount)
	return pastSignupCounts.length > 0
		? pastSignupCounts.reduce((sum, count) => sum + count, 0) / pastSignupCounts.length
		: 0
}

/**
 * Returns a monthly spend in cents spread over the days left in the UTC month, at least one day.
 */
export function toPerDaySpendCents(monthlySpendCents: number, now: number): number {
	const daysLeft = Math.max(1, toUtcMonthDaysLeft(now))
	return monthlySpendCents / daysLeft
}

type ToCutoffMonthlySpendCentsOptions = {
	monthlySpendCents: number
	highestCutoffCents: number
	now: number
}

/**
 * Returns a monthly spend in cents once the highest daily spend cutoff limits each day left in the UTC month, at least
 * one day, to that cutoff.
 */
export function toCutoffMonthlySpendCents({
	monthlySpendCents,
	highestCutoffCents,
	now,
}: ToCutoffMonthlySpendCentsOptions): number {
	const daysLeft = Math.max(1, toUtcMonthDaysLeft(now))
	return Math.min(monthlySpendCents, highestCutoffCents * daysLeft)
}

type ToCutoffPassDurationLabelOptions = {
	cutoffCents: number
	perDaySpendCents: number
}

/**
 * Returns how long after midnight UTC, as in "7h 12m", a day's spend at an even pace from midnight passes a cutoff, or
 * null if the day's spend stays at or under the cutoff.
 */
export function toCutoffPassDurationLabel({
	cutoffCents,
	perDaySpendCents,
}: ToCutoffPassDurationLabelOptions): string | null {
	if (perDaySpendCents <= cutoffCents) {
		return null
	}

	// the time after midnight that the spend reaches the cutoff
	return toHoursMinutesLabel((cutoffCents / perDaySpendCents) * DAY_MS)
}

// the days left until the first of the next UTC month, as a fraction
function toUtcMonthDaysLeft(now: number): number {
	return toUtcMonthReset(now).timeLeftMs / DAY_MS
}
