// label tests for the exact duration and dollar labels that a source result's time and cost read, the month and day
// label, and the short date label
import { expect, test } from "bun:test"
import { toDateLabel, toExactDollarLabel, toExactDurationLabel, toMonthDayLabel, toScanTimestamp } from "./labels"

// under ten seconds reads to one decimal, and from ten seconds up reads like any other duration
test("toExactDurationLabel reads to one decimal under ten seconds", () => {
	expect(toExactDurationLabel(400)).toBe("0.4s")
	expect(toExactDurationLabel(3_240)).toBe("3.2s")
	expect(toExactDurationLabel(41_000)).toBe("41s")
	expect(toExactDurationLabel(75_000)).toBe("1.3 min")
})

// zero reads as a bare $0, a sub-dollar cost keeps three decimals, and a dollar or more keeps two
test("toExactDollarLabel keeps a sub-cent cost readable", () => {
	expect(toExactDollarLabel(0)).toBe("$0")
	expect(toExactDollarLabel(0.0314)).toBe("$0.031")
	expect(toExactDollarLabel(1.5)).toBe("$1.50")
})

// a date reads as its short month and day
test("toMonthDayLabel reads a date as its month and day", () => {
	expect(toMonthDayLabel("2026-10-22T12:00:00Z")).toBe("Oct 22")
})

// completed brews use their finish time, and running brews use their start, in the device's local time zone
test("toScanTimestamp shares the Brew diary's date and time on web and mobile", () => {
	const startedAt = new Date(2026, 9, 22, 16, 30).toISOString()
	const finishedAt = new Date(2026, 9, 22, 17, 16).toISOString()
	expect(toScanTimestamp({ startedAt, finishedAt })).toBe("Oct 22 · 5:16 pm")
	expect(toScanTimestamp({ startedAt, finishedAt: null })).toBe("Oct 22 · 4:30 pm")
})

// a date reads in its short numeric form, and a missing one reads None
test("toDateLabel reads a date, or None for a missing one", () => {
	expect(toDateLabel("2026-10-22T12:00:00Z")).toBe(new Date("2026-10-22T12:00:00Z").toLocaleDateString())
	expect(toDateLabel(null)).toBe("None")
})
