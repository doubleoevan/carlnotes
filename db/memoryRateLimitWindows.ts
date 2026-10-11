// the rate limit windows a process counts in its own memory while Redis cannot count them.
// the windows expire, and a key limit bounds them
import type { RateLimitWindowHit } from "./redis"

// how many keys the memory windows hold at most. past the limit the oldest key is evicted to make room
export const MAX_MEMORY_RATE_LIMIT_KEYS = 10_000

// the memory windows by key, in insertion order, so the first key is the oldest
const memoryRateLimitWindowByKey = new Map<string, RateLimitWindowHit>()

/**
 * Counts one hit on a key's memory window and returns the count and the reset time.
 * An expired window starts over, and the oldest key is evicted once the key limit is reached.
 */
export function incrementMemoryRateLimitWindow(key: string, rateLimitWindowMs: number): RateLimitWindowHit {
	// count the hit on the key's open window
	const now = Date.now()
	const memoryRateLimitWindow = memoryRateLimitWindowByKey.get(key)
	if (memoryRateLimitWindow && memoryRateLimitWindow.resetAt > now) {
		memoryRateLimitWindow.count += 1
		return { count: memoryRateLimitWindow.count, resetAt: memoryRateLimitWindow.resetAt }
	}

	// drop the key's expired window, and make room if the key limit is reached
	memoryRateLimitWindowByKey.delete(key)
	if (memoryRateLimitWindowByKey.size >= MAX_MEMORY_RATE_LIMIT_KEYS) {
		evictMemoryRateLimitWindows(now)
	}

	// start the key's window with this hit
	const startedRateLimitWindow = { count: 1, resetAt: now + rateLimitWindowMs }
	memoryRateLimitWindowByKey.set(key, startedRateLimitWindow)
	return { ...startedRateLimitWindow }
}

/**
 * Refunds one hit on a key's open memory window, and changes nothing for a missing or expired window.
 */
export function decrementMemoryRateLimitWindow(key: string): void {
	const memoryRateLimitWindow = memoryRateLimitWindowByKey.get(key)
	if (memoryRateLimitWindow && memoryRateLimitWindow.resetAt > Date.now() && memoryRateLimitWindow.count > 0) {
		memoryRateLimitWindow.count -= 1
	}
}

/**
 * Returns how many keys the memory windows hold.
 */
export function readMemoryRateLimitWindowCount(): number {
	return memoryRateLimitWindowByKey.size
}

/**
 * Forgets every memory window.
 */
export function clearMemoryRateLimitWindows(): void {
	memoryRateLimitWindowByKey.clear()
}

// evict every expired window, then the oldest window if the key limit still holds
function evictMemoryRateLimitWindows(now: number): void {
	// drop every expired window
	for (const [key, rateLimitWindow] of memoryRateLimitWindowByKey) {
		if (rateLimitWindow.resetAt <= now) {
			memoryRateLimitWindowByKey.delete(key)
		}
	}

	// drop the oldest window if the expired ones made no room
	const oldestKey = memoryRateLimitWindowByKey.keys().next().value
	if (memoryRateLimitWindowByKey.size >= MAX_MEMORY_RATE_LIMIT_KEYS && oldestKey !== undefined) {
		memoryRateLimitWindowByKey.delete(oldestKey)
	}
}
