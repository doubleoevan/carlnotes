// the time left until the daily limits reset at midnight UTC and the monthly budget resets on the first of the UTC
// month, with the labels the reset clocks show

import { DAY_MS, HOUR_MS, MINUTE_MS } from "@carlnotes/contracts/time"

// the time left until a reset and its share of the whole period
export type UtcReset = { timeLeftMs: number; share: number }

/**
 * Returns the time left until the next midnight UTC and its share of the day.
 */
export function toUtcDayReset(now: number): UtcReset {
	const timeLeftMs = DAY_MS - (now % DAY_MS)
	return { timeLeftMs, share: timeLeftMs / DAY_MS }
}

/**
 * Returns the time left until the first of the next UTC month and its share of the month.
 */
export function toUtcMonthReset(now: number): UtcReset {
	// this month's first moment and the next month's
	const moment = new Date(now)
	const monthStartMs = Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), 1)
	const nextMonthStartMs = Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth() + 1, 1)

	// the time left and its share of the month's length
	const timeLeftMs = nextMonthStartMs - now
	return { timeLeftMs, share: timeLeftMs / (nextMonthStartMs - monthStartMs) }
}

/**
 * Formats a span as hours and minutes, as in 11h 48m, or minutes alone under an hour.
 */
export function toHoursMinutesLabel(milliseconds: number): string {
	const hours = Math.floor(milliseconds / HOUR_MS)
	const minutes = Math.floor((milliseconds % HOUR_MS) / MINUTE_MS)
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

/**
 * Formats a span as whole days, as in 19 days, or as hours and minutes under a day.
 */
export function toDaysLabel(milliseconds: number): string {
	const days = Math.floor(milliseconds / DAY_MS)
	if (days < 1) {
		return toHoursMinutesLabel(milliseconds)
	}
	return days === 1 ? "1 day" : `${days} days`
}
