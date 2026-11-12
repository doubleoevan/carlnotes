// daily count buffer tests over the fake Redis client: a view once per person a day, no user id in Redis, a retried
// play once in five minutes, the take, and a failed batch put back

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import {
	addDailyPlay,
	addDailyView,
	countSketchGroups,
	deleteTakenDailyCountSketches,
	mergeTakenDailyCountSketches,
	returnDailyCountEntries,
	takeDailyCountEntries,
	toPlaceKey,
} from "./dailyCountBuffer"
import { restoreRedisClient, stubRedisClient } from "./redisClientStub"

// the auth secret that keys each person's hash, and the one the tests replace
const savedAuthSecret = Bun.env.BETTER_AUTH_SECRET

beforeAll(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

afterAll(() => {
	Bun.env.BETTER_AUTH_SECRET = savedAuthSecret
})

afterEach(() => {
	restoreRedisClient()
})

// the people a fake sketch holds
function toSketchPeople(sketch: Uint8Array | null | undefined): string[] {
	return JSON.parse(new TextDecoder().decode(sketch ?? new Uint8Array())) as string[]
}

test("a person's views of one item count once a day, and another person's count apart", async () => {
	stubRedisClient()
	const viewedAt = new Date("2026-11-11T09:00:00Z")
	const view = { itemKind: "topic", itemId: "topic-1", place: ZURICH_PLACE, viewedAt } as const
	await addDailyView({ ...view, element: "u:user-1" })
	await addDailyView({ ...view, element: "u:user-1", viewedAt: new Date("2026-11-11T22:00:00Z") })
	await addDailyView({ ...view, element: "v:visitor-1" })

	// one row for the day and place, with two views
	const dailyCountEntries = await takeDailyCountEntries()
	expect(dailyCountEntries).toHaveLength(1)
	expect(dailyCountEntries?.[0]?.count).toBe(2)
	expect(dailyCountEntries?.[0]?.dailyCountRow).toEqual({
		dailyCountKind: "view",
		itemKind: "topic",
		itemId: "topic-1",
		day: "2026-11-11",
		place: ZURICH_PLACE,
	})
})

test("a day's viewers of an item share one claim set, and no user id reaches Redis", async () => {
	const storedValueByKey = stubRedisClient()
	const view = {
		itemKind: "topic",
		itemId: "topic-1",
		place: null,
		viewedAt: new Date("2026-11-11T09:00:00Z"),
	} as const
	await addDailyView({ ...view, element: "u:user-1" })
	await addDailyView({ ...view, element: "u:user-2" })

	// one claim set for the item's day, and neither user id in any key or value
	const claimKeys = [...storedValueByKey.keys()].filter((key) => key.startsWith("daily-counts:claim:"))
	expect(claimKeys).toEqual(["daily-counts:claim:view:2026-11-11:topic:topic-1"])
	expect([...storedValueByKey].flat().join("\n")).not.toContain("user-")
})

test("a retried play counts once, and the same format five minutes later counts again", async () => {
	const storedValueByKey = stubRedisClient()
	const play = { podcastEpisodeId: "episode-1", format: "audio", element: "u:user-1", place: null } as const
	await addDailyPlay(play)
	await addDailyPlay(play)
	expect((await takeDailyCountEntries())?.[0]?.count).toBe(1)

	// the claim expires after five minutes, which the fake shows by dropping the claim
	for (const key of storedValueByKey.keys()) {
		if (key.startsWith("daily-counts:claim:")) {
			storedValueByKey.delete(key)
		}
	}
	await addDailyPlay(play)
	expect((await takeDailyCountEntries())?.[0]?.count).toBe(1)
})

test("a taken sketch merges into the saved one, and a failed batch is put back for the next take", async () => {
	stubRedisClient()
	await addDailyView({ itemKind: "finding", itemId: "finding-1", element: "u:user-1", place: ZURICH_PLACE })
	const [dailyCountEntry] = (await takeDailyCountEntries()) ?? []
	if (!dailyCountEntry) {
		throw new Error("no entry was taken")
	}

	// the merge holds the saved person and the new one's hash
	const savedSketch = new TextEncoder().encode(JSON.stringify(["u:user-0"]))
	const [mergedSketch] =
		(await mergeTakenDailyCountSketches([{ savedSketch, dailyCountFields: [dailyCountEntry.dailyCountField] }])) ?? []
	expect(toSketchPeople(mergedSketch)).toHaveLength(2)
	expect(toSketchPeople(mergedSketch)).toContain("u:user-0")

	// a failed save puts the count and the sketch back, and the next take returns them
	await returnDailyCountEntries([dailyCountEntry])
	const [returnedEntry] = (await takeDailyCountEntries()) ?? []
	expect(returnedEntry?.count).toBe(1)
	await deleteTakenDailyCountSketches(returnedEntry ? [returnedEntry] : [])
	// with the taken sketch dropped, a merge holds nobody
	const [emptySketch] =
		(await mergeTakenDailyCountSketches([
			{ savedSketch: null, dailyCountFields: [dailyCountEntry.dailyCountField] },
		])) ?? []
	expect(toSketchPeople(emptySketch)).toEqual([])
})

test("each group counts the distinct people its sketches hold together, and an empty group counts none", async () => {
	stubRedisClient()
	const sketches = [
		["u:a", "u:b"],
		["u:b", "u:c"],
	].map((members) => new TextEncoder().encode(JSON.stringify(members)))
	expect(await countSketchGroups(sketches, [[0, 1], [1], []])).toEqual([3, 2, 0])
})

test("a place key is the same for the same place and unknown for none", () => {
	expect(toPlaceKey(ZURICH_PLACE)).toBe(toPlaceKey({ ...ZURICH_PLACE }))
	expect(toPlaceKey({ ...ZURICH_PLACE, city: "Winterthur" })).not.toBe(toPlaceKey(ZURICH_PLACE))
	expect(toPlaceKey(null)).toBe("unknown")
})
