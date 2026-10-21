// memory rate limit window tests: counting, refunds, expiry, and the key limit
import { afterEach, beforeEach, expect, test } from "bun:test"
import {
	clearMemoryRateLimitWindows,
	decrementMemoryRateLimitWindow,
	incrementMemoryRateLimitWindow,
	MAX_MEMORY_RATE_LIMIT_KEYS,
	readMemoryRateLimitWindowCount,
} from "./memoryRateLimitWindows"

// the real Date.now, saved before a test moves the clock
const originalDateNow = Date.now

// start every test with no windows, and put the clock back after each
beforeEach(() => {
	clearMemoryRateLimitWindows()
})
afterEach(() => {
	Date.now = originalDateNow
})

// the first hit opens a window that resets after the window length, and each hit after counts one more
test("hits count up inside a window, and a refund counts one down", () => {
	// the first hit opens the window
	const firstRateLimitWindowHit = incrementMemoryRateLimitWindow("k", 60_000)
	expect(firstRateLimitWindowHit.count).toBe(1)
	expect(firstRateLimitWindowHit.resetAt - Date.now()).toBeGreaterThan(59_000)

	// a hit, a refund, and a hit leave the count at two, on the same window
	expect(incrementMemoryRateLimitWindow("k", 60_000).count).toBe(2)
	decrementMemoryRateLimitWindow("k")
	expect(incrementMemoryRateLimitWindow("k", 60_000).count).toBe(2)
	expect(incrementMemoryRateLimitWindow("k", 60_000).resetAt).toBe(firstRateLimitWindowHit.resetAt)
})

// a hit after the window's reset starts a fresh window, and a refund on a missing or expired window changes nothing
test("an expired window is evicted on the next hit, and a refund on it changes nothing", () => {
	// a window that resets a minute from now
	const startedAt = Date.now()
	incrementMemoryRateLimitWindow("k", 60_000)
	incrementMemoryRateLimitWindow("k", 60_000)

	// a minute later the window has expired, so a refund changes nothing and the next hit starts over
	Date.now = () => startedAt + 60_001
	decrementMemoryRateLimitWindow("k")
	decrementMemoryRateLimitWindow("missing")
	const freshRateLimitWindowHit = incrementMemoryRateLimitWindow("k", 60_000)
	expect(freshRateLimitWindowHit.count).toBe(1)
	expect(freshRateLimitWindowHit.resetAt).toBe(startedAt + 60_001 + 60_000)
	expect(readMemoryRateLimitWindowCount()).toBe(1)
})

// one key past the limit evicts the oldest key, so the oldest key's next hit starts over while a newer key keeps counting
test("the key limit holds, and the oldest key is evicted first", () => {
	// the limit's worth of keys, each hit once
	for (let i = 0; i < MAX_MEMORY_RATE_LIMIT_KEYS; i++) {
		incrementMemoryRateLimitWindow(`k${i}`, 60_000)
	}
	expect(readMemoryRateLimitWindowCount()).toBe(MAX_MEMORY_RATE_LIMIT_KEYS)

	// one more key evicts the oldest, and the count stays at the limit
	incrementMemoryRateLimitWindow("new", 60_000)
	expect(readMemoryRateLimitWindowCount()).toBe(MAX_MEMORY_RATE_LIMIT_KEYS)
	expect(incrementMemoryRateLimitWindow("k1", 60_000).count).toBe(2)
	expect(incrementMemoryRateLimitWindow("k0", 60_000).count).toBe(1)
})

// expired keys are evicted before any live key is, so a live key survives the limit while expired ones go
test("expired keys are evicted before the oldest live key", () => {
	// the limit's worth of keys that expire in a millisecond, then one live key a minute long, on a stopped clock
	const startedAt = Date.now()
	Date.now = () => startedAt
	for (let i = 0; i < MAX_MEMORY_RATE_LIMIT_KEYS - 1; i++) {
		incrementMemoryRateLimitWindow(`short${i}`, 1)
	}
	incrementMemoryRateLimitWindow("live", 60_000)

	// once the short windows have expired, a new key drops them all and keeps the live key
	Date.now = () => startedAt + 2
	incrementMemoryRateLimitWindow("new", 60_000)
	expect(readMemoryRateLimitWindowCount()).toBe(2)
	expect(incrementMemoryRateLimitWindow("live", 60_000).count).toBe(2)
})
