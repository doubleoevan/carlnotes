// rate limit tests over fake clients: the window counter in Redis and in memory, the refund, the shared slot, and the
// hit count against a limit
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { type FakeRedisServer, startFakeRedisStore } from "./redisFakeServer"
import {
	countRateLimitHit,
	decrementRateLimitWindow,
	incrementRateLimitWindow,
	takeRateLimitSlot,
} from "./redisRateLimits"

// the fake server that each test's store talks to, and a quiet console
let fakeRedisServer: FakeRedisServer
beforeEach(() => {
	fakeRedisServer = startFakeRedisStore().fakeRedisServer
	spyOn(console, "error").mockImplementation(() => {})
})

// restore every spy after each test, the console included
afterEach(() => {
	mock.restore()
})

// the first hit counts one with the whole rate limit window left, the second counts two, a hit that Redis could not
// count counts in memory under the same key, and the next hit Redis counts reads Redis's count
test("incrementRateLimitWindow counts hits in Redis, in memory while Redis is down, and in Redis again after", async () => {
	// two hits on one rate limit window
	const firstRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	const secondRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	expect(firstRateLimitWindowHit.count).toBe(1)
	expect(secondRateLimitWindowHit.count).toBe(2)
	expect(firstRateLimitWindowHit.resetAt - Date.now()).toBeGreaterThan(59_000)

	// two hits count in memory while commands fail, starting a memory window of their own
	fakeRedisServer.isCommandFailing = true
	const firstMemoryRateLimitWindowHit = await incrementRateLimitWindow("w", 60_000)
	expect(firstMemoryRateLimitWindowHit.count).toBe(1)
	expect(firstMemoryRateLimitWindowHit.resetAt - Date.now()).toBeGreaterThan(59_000)
	expect((await incrementRateLimitWindow("w", 60_000)).count).toBe(2)

	// the next hit Redis counts is Redis's third, with nothing added from memory
	fakeRedisServer.isCommandFailing = false
	expect((await incrementRateLimitWindow("w", 60_000)).count).toBe(3)
})

// a refund lowers an open rate limit window, a rate limit window that already closed stays closed, and a refund
// that Redis could not run lowers the memory window
test("decrementRateLimitWindow lowers an open rate limit window, leaves a closed one closed, and refunds the memory window", async () => {
	// two hits, then one refund
	await incrementRateLimitWindow("w", 60_000)
	await incrementRateLimitWindow("w", 60_000)
	await decrementRateLimitWindow("w")
	expect(fakeRedisServer.storedValueByKey.get("w")).toBe("1")

	// a refund on a key whose rate limit window expired creates nothing
	await decrementRateLimitWindow("expired")
	expect(fakeRedisServer.storedValueByKey.has("expired")).toBe(false)

	// two memory hits and one memory refund leave the next memory hit at two
	fakeRedisServer.isCommandFailing = true
	await incrementRateLimitWindow("m", 60_000)
	await incrementRateLimitWindow("m", 60_000)
	await decrementRateLimitWindow("m")
	expect((await incrementRateLimitWindow("m", 60_000)).count).toBe(2)
})

// one call holds a rate limit slot for its length, the next call waits about that long, and a failed take returns null
test("takeRateLimitSlot takes a free slot, returns the wait while another call holds it, and returns null while Redis is down", async () => {
	// one call takes the slot, and the next has to wait about the slot's whole length
	const rateLimitSlot = { key: "s", slotMs: 60_000 }
	expect(await takeRateLimitSlot(rateLimitSlot)).toBe(0)
	expect(await takeRateLimitSlot(rateLimitSlot)).toBeGreaterThan(59_000)

	// a take returns null while commands fail
	fakeRedisServer.isCommandFailing = true
	expect(await takeRateLimitSlot(rateLimitSlot)).toBeNull()
})

// each hit counts in the key's window, so the hits up to the limit pass and the next one fails
test("countRateLimitHit passes the hits up to the limit and fails the next", async () => {
	const countRateLimitHitOptions = { key: "hits", rateLimitWindowMs: 60_000, limit: 2 }
	const hitResults = [
		await countRateLimitHit(countRateLimitHitOptions),
		await countRateLimitHit(countRateLimitHitOptions),
		await countRateLimitHit(countRateLimitHitOptions),
	]
	expect(hitResults).toEqual([true, true, false])
})
