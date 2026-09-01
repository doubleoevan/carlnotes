// checks for the stream reconnect backoff: exponential growth, the jitter range, and the limit
import { expect, test } from "bun:test"
import { toReconnectDelayMs } from "./useChatRoomStream"

// each failed attempt doubles the wait, jittered down by up to half
test("the wait grows exponentially inside the jitter range", () => {
	for (const [failedAttempts, backoffMs] of [
		[0, 1000],
		[1, 2000],
		[3, 8000],
	] as const) {
		const delayMs = toReconnectDelayMs(failedAttempts)
		expect(delayMs).toBeGreaterThanOrEqual(backoffMs / 2)
		expect(delayMs).toBeLessThanOrEqual(backoffMs)
	}
})

// the wait never grows past the limit no matter how many attempts failed
test("the wait never passes thirty seconds", () => {
	for (let failedAttempts = 5; failedAttempts < 100; failedAttempts += 10) {
		expect(toReconnectDelayMs(failedAttempts)).toBeLessThanOrEqual(30_000)
	}
})
