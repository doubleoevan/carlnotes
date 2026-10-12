// the rate limit windows and slots that every process shares through Redis. a window hit that Redis could not count
// falls back to this process's memory
import { decrementMemoryRateLimitWindow, incrementMemoryRateLimitWindow } from "./memoryRateLimitWindows"
import { runWithRedis } from "./redis"

// a script that atomically increments a key and starts the key's expiry on the rate limit window's first hit.
// the script's reply is the count and the milliseconds left in the rate limit window
const INCREMENT_RATE_LIMIT_WINDOW_SCRIPT = [
	"local count = redis.call('INCR', KEYS[1])",
	"if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
	"return {count, redis.call('PTTL', KEYS[1])}",
].join("\n")

// a script that decrements a key only if the key's rate limit window is still open,
// so a refund never creates a key with no expiry
const DECREMENT_RATE_LIMIT_WINDOW_SCRIPT =
	"if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('DECR', KEYS[1]) end return 0"

// a script that takes a rate limit slot if no other call holds it, for the slot's length. the script's reply is 0 if this
// call took the slot, or the milliseconds until the slot frees. the slot expires on the Redis server's clock
const TAKE_RATE_LIMIT_SLOT_SCRIPT =
	"if redis.call('SET', KEYS[1], '1', 'NX', 'PX', ARGV[1]) then return 0 end return math.max(redis.call('PTTL', KEYS[1]), 1)"

// one hit on a rate limit window, with the count so far and when the rate limit window resets
export type RateLimitWindowHit = { count: number; resetAt: number }

// the key of a rate limit window, how long the window is, and how many hits it allows
export type CountRateLimitHitOptions = { key: string; rateLimitWindowMs: number; limit: number }

// the key of a rate limit slot, and how long one call holds the slot
export type TakeRateLimitSlotOptions = { key: string; slotMs: number }

/**
 * Counts one hit on a fixed rate limit window and returns the count and when the rate limit window resets.
 * A hit that Redis could not count is counted in this process's memory under the same key and window.
 */
export async function incrementRateLimitWindow(key: string, rateLimitWindowMs: number): Promise<RateLimitWindowHit> {
	// run the increment script, and count the hit in memory if the script fails or the script's reply is not two values
	const scriptReply: unknown = await runWithRedis("incrementRateLimitWindow", (client) =>
		client.send("EVAL", [INCREMENT_RATE_LIMIT_WINDOW_SCRIPT, "1", key, String(rateLimitWindowMs)]),
	)
	if (!Array.isArray(scriptReply) || scriptReply.length !== 2) {
		return incrementMemoryRateLimitWindow(key, rateLimitWindowMs)
	}

	// return the count and the reset time. the reply's numbers may arrive as integers or big integers
	const [count, ttlMs] = scriptReply.map(Number)
	return { count: count ?? 0, resetAt: Date.now() + Math.max(ttlMs ?? 0, 0) }
}

/**
 * Refunds one hit on a rate limit window that is still open, in memory if Redis could not run the refund.
 */
export async function decrementRateLimitWindow(key: string): Promise<void> {
	// run the refund script, and refund the memory window if Redis could not run it
	const scriptReply = await runWithRedis("decrementRateLimitWindow", (client) =>
		client.send("EVAL", [DECREMENT_RATE_LIMIT_WINDOW_SCRIPT, "1", key]),
	)
	if (scriptReply === null) {
		decrementMemoryRateLimitWindow(key)
	}
}

/**
 * Takes a rate limit slot that every process shares. Returns 0 if this call took the slot,
 * the milliseconds until the slot frees if another call holds it, or null if Redis could not run the script.
 */
export async function takeRateLimitSlot({ key, slotMs }: TakeRateLimitSlotOptions): Promise<number | null> {
	// run the script, then return the wait. the reply's number may arrive as an integer or a big integer, and anything
	// else is a failure
	const scriptReply: unknown = await runWithRedis("takeRateLimitSlot", (client) =>
		client.send("EVAL", [TAKE_RATE_LIMIT_SLOT_SCRIPT, "1", key, String(slotMs)]),
	)
	const waitMs = Number(scriptReply)
	return scriptReply === null || !Number.isFinite(waitMs) ? null : waitMs
}

/**
 * Counts one hit on a fixed rate limit window and returns whether the hit is within the limit.
 */
export async function countRateLimitHit({ key, rateLimitWindowMs, limit }: CountRateLimitHitOptions): Promise<boolean> {
	const { count } = await incrementRateLimitWindow(key, rateLimitWindowMs)
	return count <= limit
}
