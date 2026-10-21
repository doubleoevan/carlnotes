// the ttl cache the content files are read through: no read inside the ttl,
// one new read after it for calls that arrive together, and no failed read kept
import { afterEach, expect, setSystemTime, test } from "bun:test"
import { cacheForTtl } from "./ttlCache"

// the ttl the content files are kept for
const TTL_MS = 60_000

// put the real clock back after each test, whether its assertions pass or not
afterEach(() => {
	setSystemTime()
})

// inside the ttl a call reads nothing, and once the ttl passes, three calls together share one new read,
// which is how a new post appears within a minute
test("a read inside the ttl reads nothing, and concurrent reads after it share one refresh", async () => {
	let readCount = 0
	const loadCachedRead = cacheForTtl(async () => {
		readCount += 1
		await Bun.sleep(1)
		return readCount
	}, TTL_MS)

	// the first read, then a call 59 seconds later that the kept value serves
	setSystemTime(new Date("2026-09-29T12:00:00Z"))
	expect(await loadCachedRead()).toBe(1)
	setSystemTime(new Date("2026-09-29T12:00:59Z"))
	expect(await loadCachedRead()).toBe(1)

	// a minute in, three calls together start one refresh
	setSystemTime(new Date("2026-09-29T12:01:00Z"))
	expect(await Promise.all([loadCachedRead(), loadCachedRead(), loadCachedRead()])).toEqual([2, 2, 2])
	expect(readCount).toBe(2)
})

// a failed read is not kept, so the next call reads again instead of failing for the rest of the ttl
test("a failed read is not kept", async () => {
	let readCount = 0

	// a read whose first call fails
	const loadCachedRead = cacheForTtl(async () => {
		readCount += 1
		if (readCount === 1) {
			throw new Error("the folder could not be listed")
		}
		return readCount
	}, TTL_MS)

	// the first call fails, and the second reads again
	await expect(loadCachedRead()).rejects.toThrow("the folder could not be listed")
	expect(await loadCachedRead()).toBe(2)
})
