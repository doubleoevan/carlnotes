// viewer count tests over the fake Redis client: counting once per element, taking the changed refs, and restoring
// a saved counter after a restart
import { afterEach, expect, test } from "bun:test"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "./redisClientStub"
import {
	addViewer,
	hasRestoredViewerCounters,
	markViewerCountRefsChanged,
	readViewerCounter,
	readViewerEstimate,
	restoreViewerCounters,
	takeChangedViewerCountRefs,
} from "./viewerCounts"

// the topic every test counts
const TOPIC_REF = { kind: "topic", id: "topic-1" } as const

afterEach(() => {
	restoreRedisClient()
})

test("one element counts once, however often it is added", async () => {
	stubRedisClient()
	await addViewer(TOPIC_REF, "u:user-1")
	await addViewer(TOPIC_REF, "u:user-1")
	await addViewer(TOPIC_REF, "v:visitor-1")
	expect(await readViewerEstimate(TOPIC_REF)).toBe(2)
})

test("a changed ref is taken once, and marking it again lists it for the next take", async () => {
	stubRedisClient()
	await addViewer(TOPIC_REF, "u:user-1")
	expect(await takeChangedViewerCountRefs()).toEqual([TOPIC_REF])
	expect(await takeChangedViewerCountRefs()).toEqual([])

	// a sync that could not save the ref puts it back
	await markViewerCountRefsChanged([TOPIC_REF])
	expect(await takeChangedViewerCountRefs()).toEqual([TOPIC_REF])
})

test("a saved counter merges back into a counter that restarted empty, keeping both", async () => {
	stubRedisClient()
	await addViewer(TOPIC_REF, "u:user-1")
	const savedCounter = await readViewerCounter(TOPIC_REF)
	expect(savedCounter).not.toBeNull()

	// a restart empties Redis, and a new viewer arrives before the restore
	restoreRedisClient()
	stubRedisClient()
	expect(await hasRestoredViewerCounters()).toBe(false)
	await addViewer(TOPIC_REF, "v:visitor-1")

	// the merge is a union, so the count holds the saved viewer and the new one
	const savedCounters = [{ viewerCountRef: TOPIC_REF, counter: savedCounter ?? new Uint8Array() }]
	expect(await restoreViewerCounters({ savedCounters, viewerCountSeeds: [] })).toBe(true)
	expect(await readViewerEstimate(TOPIC_REF)).toBe(2)
	expect(await hasRestoredViewerCounters()).toBe(true)
})

test("a restore adds each seeded person once and lists the seeded ref as changed", async () => {
	stubRedisClient()
	await addViewer(TOPIC_REF, "u:owner-1")
	await takeChangedViewerCountRefs()

	// the seed holds the owner the counter already counts and one new subscriber
	const viewerCountSeeds = [{ viewerCountRef: TOPIC_REF, elements: ["u:owner-1", "u:subscriber-1"] }]
	expect(await restoreViewerCounters({ savedCounters: [], viewerCountSeeds })).toBe(true)
	expect(await readViewerEstimate(TOPIC_REF)).toBe(2)
	expect(await takeChangedViewerCountRefs()).toEqual([TOPIC_REF])

	// a second restore leaves the estimate at two
	expect(await restoreViewerCounters({ savedCounters: [], viewerCountSeeds })).toBe(true)
	expect(await readViewerEstimate(TOPIC_REF)).toBe(2)
})

test("an unreachable Redis loses the count and reads no estimate, without throwing an error", async () => {
	stubUnreachableRedisClient()
	await addViewer(TOPIC_REF, "u:user-1")
	expect(await readViewerEstimate(TOPIC_REF)).toBeNull()
	expect(await takeChangedViewerCountRefs()).toBeNull()
})
