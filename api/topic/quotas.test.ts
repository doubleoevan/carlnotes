// quota tests for plan limits
import { expect, test } from "bun:test"
import { startOfUtcDay } from "./quotas"

// the quota day starts at utc midnight of the given moment
test("startOfUtcDay returns utc midnight of the same day", () => {
	const midDay = new Date("2026-07-21T17:45:30.000Z")
	expect(startOfUtcDay(midDay).toISOString()).toBe("2026-07-21T00:00:00.000Z")
})
