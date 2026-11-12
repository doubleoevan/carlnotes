import { expect, test } from "bun:test"
import { toDaysLabel, toHoursMinutesLabel, toUtcDayReset, toUtcMonthReset } from "./utcResets"

test("the day resets at midnight UTC and the month on the first of the next UTC month", () => {
	// noon UTC on November 11 has half the day left
	const now = Date.UTC(2026, 10, 11, 12, 0)
	expect(toUtcDayReset(now)).toEqual({ timeLeftMs: 12 * 60 * 60 * 1000, share: 0.5 })

	// noon on November 11 leaves 19 and a half of November's 30 days
	const monthReset = toUtcMonthReset(now)
	expect(monthReset.timeLeftMs).toBe(19.5 * 24 * 60 * 60 * 1000)
	expect(monthReset.share).toBeCloseTo(19.5 / 30)

	// December rolls over into January of the next year
	expect(toUtcMonthReset(Date.UTC(2026, 11, 31, 23, 0)).timeLeftMs).toBe(60 * 60 * 1000)
})

test("a reset's time left reads in days down to a day and in hours and minutes under one", () => {
	expect(toDaysLabel(19.5 * 24 * 60 * 60 * 1000)).toBe("19 days")
	expect(toDaysLabel(30 * 60 * 60 * 1000)).toBe("1 day")
	expect(toDaysLabel(5 * 60 * 60 * 1000 + 12 * 60 * 1000)).toBe("5h 12m")
	expect(toHoursMinutesLabel(48 * 60 * 1000)).toBe("48m")
})
