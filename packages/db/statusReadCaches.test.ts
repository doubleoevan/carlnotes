// status read copy tests: a copy is read back without a second load, a clear deletes it, and a Redis failure loads
// the row
import { afterEach, beforeEach, expect, test } from "bun:test"
import { STATUS_FIRST_POLL_MS } from "@carlnotes/contracts/statusReads"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "./redisClientStub"
import { clearStatusReads, readStatusRead, STATUS_READ_TTL_MS, toStatusReadKey } from "./statusReadCaches"

// the fake Redis map each test starts with
let storedValueByKey: Map<string, string>

// a fresh Redis map before each test, and the real client after it
beforeEach(() => {
	storedValueByKey = stubRedisClient()
})
afterEach(() => {
	restoreRedisClient()
})

// a load that counts its calls and returns the status it is given
function toCountedLoad(status: string): { load: () => Promise<{ status: string }>; toLoadCount: () => number } {
	let loadCount = 0
	return {
		load: async () => {
			loadCount += 1
			return { status }
		},
		toLoadCount: () => loadCount,
	}
}

test("a status copy is read back without a second load, and a clear makes the next read load again", async () => {
	// the first read loads the row and stores it, and the second reads the copy
	const { load, toLoadCount } = toCountedLoad("running")
	const statusRead = { statusKind: "scan" as const, subjectId: "topic-1", load }
	expect(await readStatusRead(statusRead)).toEqual({ status: "running" })
	expect(await readStatusRead(statusRead)).toEqual({ status: "running" })
	expect(toLoadCount()).toBe(1)

	// the clear deletes the key, so the next read loads the row again
	await clearStatusReads("scan", "topic-1")
	expect(storedValueByKey.has(toStatusReadKey("scan", "topic-1"))).toBe(false)
	await readStatusRead(statusRead)
	expect(toLoadCount()).toBe(2)
})

test("a clear deletes every named subject's key of its kind alone", async () => {
	// a film's copy for two podcast episodes, and a discussion's under the same id
	storedValueByKey.set(toStatusReadKey("topicVideo", "episode-1"), "{}")
	storedValueByKey.set(toStatusReadKey("topicVideo", "episode-2"), "{}")
	storedValueByKey.set(toStatusReadKey("topicPostDiscussion", "episode-1"), "{}")
	await clearStatusReads("topicVideo", "episode-1", "episode-2")
	expect([...storedValueByKey.keys()]).toEqual([toStatusReadKey("topicPostDiscussion", "episode-1")])
})

test("a missing subject's null is never stored", async () => {
	// a load that finds no row, read twice
	let loadCount = 0
	const load = async (): Promise<null> => {
		loadCount += 1
		return null
	}
	// both reads load, and nothing is stored
	const statusRead = { statusKind: "scan" as const, subjectId: "topic-gone", load }
	expect(await readStatusRead(statusRead)).toBeNull()
	expect(await readStatusRead(statusRead)).toBeNull()
	expect(loadCount).toBe(2)
	expect(storedValueByKey.has(toStatusReadKey("scan", "topic-gone"))).toBe(false)
})

test("each lifetime is longer than its poll's first interval", () => {
	for (const statusKind of Object.keys(STATUS_FIRST_POLL_MS) as (keyof typeof STATUS_FIRST_POLL_MS)[]) {
		expect(STATUS_READ_TTL_MS[statusKind]).toBeGreaterThan(STATUS_FIRST_POLL_MS[statusKind])
	}
})

test("a read while Redis is unreachable loads the row each time", async () => {
	// a client that never connects, so every read loads
	stubUnreachableRedisClient()
	const { load, toLoadCount } = toCountedLoad("rendering")
	const statusRead = { statusKind: "topicVideo" as const, subjectId: "episode-1", load }
	expect(await readStatusRead(statusRead)).toEqual({ status: "rendering" })
	expect(await readStatusRead(statusRead)).toEqual({ status: "rendering" })
	expect(toLoadCount()).toBe(2)
})
