// tests for utils methods and dependencies
import { afterEach, expect, setSystemTime, test } from "bun:test"
import { cn, toAgeLabel } from "./utils"

// twMerge makes later tailwind classes win over earlier conflicting ones
test("cn merges conflicting tailwind classes", () => {
	expect(cn("p-2", "p-4")).toBe("p-4")
})

// clsx drops falsy conditional values and keeps truthy ones
test("cn handles conditional class values", () => {
	expect(cn("base", false && "hidden", true && "block")).toBe("base block")
})

// the age label tests need to freeze the clock so that buckets are deterministic. reset to real time after each test
afterEach(() => setSystemTime())

test("toAgeLabel buckets elapsed time into the coarsest unit", () => {
	setSystemTime(new Date("2026-07-17T12:00:00.000Z"))
	const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
	// null and same-day
	expect(toAgeLabel(null)).toBe("")
	expect(toAgeLabel(ago(0))).toBe("today")
	// days and weeks
	expect(toAgeLabel(ago(6))).toBe("6d")
	expect(toAgeLabel(ago(7))).toBe("1w")
	expect(toAgeLabel(ago(29))).toBe("4w")
	// months and years, including the boundaries
	expect(toAgeLabel(ago(30))).toBe("1mo")
	expect(toAgeLabel(ago(364))).toBe("12mo")
	expect(toAgeLabel(ago(365))).toBe("1y")
	expect(toAgeLabel(ago(900))).toBe("2y")
})
