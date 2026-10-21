// the stream reconnect timing that both chat and note streams share
import { expect, test } from "bun:test"
import { STALE_STREAM_MS, toReconnectStreamDelayMs } from "./streamReconnect"

// each failed attempt doubles the wait, jittered down by up to half, never past the limit
test("the stream reconnect delay grows exponentially and stays bounded", () => {
	for (const [failedAttempts, backoffMs] of [
		[0, 1000],
		[1, 2000],
		[3, 8000],
	] as const) {
		const delayMs = toReconnectStreamDelayMs(failedAttempts)
		expect(delayMs).toBeGreaterThanOrEqual(backoffMs / 2)
		expect(delayMs).toBeLessThanOrEqual(backoffMs)
	}
	expect(toReconnectStreamDelayMs(50)).toBeLessThanOrEqual(30_000)
})

// the client only declares a stream dead well after the server's 25 second ping, so one slow ping is not a drop
test("a stream outlives more than one missed heartbeat", () => {
	expect(STALE_STREAM_MS).toBeGreaterThan(25_000 * 2)
})
