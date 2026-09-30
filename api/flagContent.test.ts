// flag limit tests: the daily rate limit window in Redis, the rejection of the eleventh flag, a refunded flag,
// and a flag allowed while Redis is unreachable
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as redis from "../db/redis"
import { canFlag, refundFlag } from "./flagContent"

// put the spied Redis functions back after each test
afterEach(() => {
	mock.restore()
})

// the tenth flag of a day is allowed and the eleventh is rejected. the flags count under the user's Redis key for a day
test("the tenth flag is allowed and the eleventh is rejected", async () => {
	const incrementRateLimitWindowSpy = spyOn(redis, "incrementRateLimitWindow")
		.mockResolvedValueOnce({ count: 10, resetAt: 0 })
		.mockResolvedValueOnce({ count: 11, resetAt: 0 })
	expect(await canFlag("user-1")).toBe(true)
	expect(await canFlag("user-1")).toBe(false)
	expect(incrementRateLimitWindowSpy).toHaveBeenCalledWith("flags:user-1", 24 * 60 * 60 * 1000)
})

// a refund decrements the same Redis key that the user's flags count under
test("a refund lowers the count on the user's key", async () => {
	const decrementRateLimitWindowSpy = spyOn(redis, "decrementRateLimitWindow").mockResolvedValue(undefined)
	await refundFlag("user-1")
	expect(decrementRateLimitWindowSpy).toHaveBeenCalledWith("flags:user-1")
})

// a flag that Redis could not count is allowed
test("a flag is allowed while Redis is unreachable", async () => {
	spyOn(redis, "incrementRateLimitWindow").mockResolvedValue(null)
	expect(await canFlag("user-1")).toBe(true)
})
