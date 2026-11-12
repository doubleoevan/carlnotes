// the daily count flush: a taken view adds to its daily count row with the merged sketch, a failed batch is put back,
// and a play of a deleted podcast episode is dropped

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import { toUtcDay } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { addDailyPlay, addDailyView, takeDailyCountEntries, toPlaceKey } from "@carlnotes/db/dailyCountBuffer"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { saveDailyCounts } from "./saveDailyCounts"

// the viewer sketch Postgres saved for the row, which the fake Redis stores as a JSON array of its people
const SAVED_SKETCH = Buffer.from(JSON.stringify(["u:saved-user"]))

// the auth secret that keys each person's hash, and the one the tests replace
const savedAuthSecret = Bun.env.BETTER_AUTH_SECRET

beforeAll(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

afterAll(() => {
	Bun.env.BETTER_AUTH_SECRET = savedAuthSecret
})

afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

// the people a sketch sent to Postgres holds
function toSketchPeople(sketch: unknown): string[] {
	return JSON.parse(new TextDecoder().decode(sketch as Uint8Array)) as string[]
}

test("a taken view adds its count to the row with the saved sketch merged in, and the buffer empties", async () => {
	stubRedisClient()
	await addDailyView({ itemKind: "topic", itemId: "topic-1", element: "u:user-1", place: ZURICH_PLACE })

	// Postgres holds the row's saved sketch
	const savedRow = ["topic", "topic-1", toUtcDay(new Date()), toPlaceKey(ZURICH_PLACE), SAVED_SKETCH]
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('select "item_kind", "item_id", "day", "place_key", "viewer_sketch" from "daily_view_counts"')
			? [savedRow]
			: [],
	)
	await saveDailyCounts()

	// the upsert adds one view, keeps the place exactly, and saves the union of the saved person and the taken one's hash
	const upsert = sentQueries.find(({ text }) => text.startsWith('insert into "daily_view_counts"'))
	expect(upsert?.text).toContain('"view_count" = "daily_view_counts"."view_count" + excluded.view_count')
	expect(upsert?.values).toEqual(expect.arrayContaining(["topic", "topic-1", "CH", "Zürich", "47.36667", "8.55", 1]))
	const sketchPeople = toSketchPeople(upsert?.values.find((value) => value instanceof Uint8Array))
	expect(sketchPeople).toHaveLength(2)
	expect(sketchPeople).toContain("u:saved-user")
	expect(await takeDailyCountEntries()).toEqual([])
})

test("a batch whose save fails is put back for the next sweep with its count", async () => {
	stubRedisClient()
	await addDailyView({ itemKind: "finding", itemId: "finding-1", element: "u:user-1", place: null })

	// the insert fails
	stubConnectionPool(({ text }) => {
		if (text.startsWith('insert into "daily_view_counts"')) {
			throw new Error("connection lost")
		}
		return []
	})
	await saveDailyCounts()

	// the next take returns the view
	const [dailyCountEntry] = (await takeDailyCountEntries()) ?? []
	expect(dailyCountEntry?.count).toBe(1)
	expect(dailyCountEntry?.dailyCountRow).toMatchObject({ itemKind: "finding", itemId: "finding-1" })
})

test("a play of a deleted podcast episode is dropped, and a play of one that exists is saved", async () => {
	stubRedisClient()
	await addDailyPlay({ podcastEpisodeId: "episode-gone", format: "audio", element: "u:user-1", place: null })
	await addDailyPlay({ podcastEpisodeId: "episode-1", format: "video", element: "u:user-1", place: null })

	// only episode-1 still exists
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('select "id" from "episodes"') ? [["episode-1"]] : [],
	)
	await saveDailyCounts()

	// one play upsert, for episode-1, and nothing left in the buffer
	const upserts = sentQueries.filter(({ text }) => text.startsWith('insert into "daily_play_counts"'))
	expect(upserts.map(({ values }) => values.slice(0, 2))).toEqual([["episode-1", "video"]])
	expect(await takeDailyCountEntries()).toEqual([])
})
