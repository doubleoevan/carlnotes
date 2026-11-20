// the daily count flush: a taken view adds to its daily count row with the merged sketch, a failed batch is put back
// and reported with the sweeps in a row that failed one, a take or a put-back that Redis could not run is reported,
// and a play of a deleted podcast episode is dropped

import { afterAll, afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import { toUtcDay } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as dailyCountBuffer from "@carlnotes/db/dailyCountBuffer"
import { addDailyPlay, addDailyView, takeDailyCountEntries } from "@carlnotes/db/dailyCountBuffer"
import { toPlaceKey } from "@carlnotes/db/dailyCountPlaces"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import * as monitoring from "@carlnotes/server/monitoring"
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
	mock.restore()
})

// a pool whose daily view count insert fails while the flag is set, and a quiet console
function stubFailingViewCountInsert(insertState: { isFailing: boolean }): void {
	spyOn(console, "error").mockImplementation(() => {})
	stubConnectionPool(({ text }) => {
		// only the upsert of the view counts fails
		if (insertState.isFailing && text.startsWith('insert into "daily_view_counts"')) {
			throw new Error("connection lost")
		}
		return []
	})
}

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

test("a failed batch's report counts the sweeps in a row that failed one, and a sweep that saves every batch ends the count", async () => {
	// one buffered view, an insert that fails, and the reports the sweeps send
	const storedValueByKey = stubRedisClient()
	await addDailyView({ itemKind: "finding", itemId: "finding-1", element: "u:user-1", place: null })
	const insertState = { isFailing: true }
	stubFailingViewCountInsert(insertState)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// two sweeps in a row fail the batch, and each report names the batch's rows and the sweeps so far
	await saveDailyCounts()
	await saveDailyCounts()
	expect(reportErrorSpy.mock.calls.map(([, stage, extra]) => [stage, extra])).toEqual([
		["database", { dailyCountRowCount: "1", failedSweepCount: "1" }],
		["database", { dailyCountRowCount: "1", failedSweepCount: "2" }],
	])

	// a sweep that saves the batch ends the count, so the next failed sweep is the first again
	insertState.isFailing = false
	await saveDailyCounts()
	expect(storedValueByKey.has("daily-counts:failed-sweeps")).toBe(false)
	insertState.isFailing = true
	await addDailyView({ itemKind: "finding", itemId: "finding-2", element: "u:user-1", place: null })
	await saveDailyCounts()
	expect(reportErrorSpy.mock.calls.at(-1)?.[2]).toEqual({ dailyCountRowCount: "1", failedSweepCount: "1" })
})

test("a take that finds Redis down is reported, and nothing is saved", async () => {
	// a Redis that never connects
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(() => [])
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	await saveDailyCounts()

	// one report in the database stage, and no query
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	const [reportedError, stage] = reportErrorSpy.mock.calls[0] ?? []
	expect((reportedError as Error).message).toBe("the sweep could not take the daily counts from Redis")
	expect(stage).toBe("database")
	expect(sentQueries).toEqual([])
})

test("a failed batch that Redis could not put back is reported as lost", async () => {
	// one buffered view, an insert that fails, and a put-back that Redis does not run
	stubRedisClient()
	await addDailyView({ itemKind: "finding", itemId: "finding-1", element: "u:user-1", place: null })
	stubFailingViewCountInsert({ isFailing: true })
	spyOn(dailyCountBuffer, "returnDailyCountEntries").mockResolvedValue(false)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	await saveDailyCounts()

	// the failed save is reported, then the lost batch with its row count
	const reportedMessages = reportErrorSpy.mock.calls.map(([reportedError]) => (reportedError as Error).message)
	expect(reportedMessages).toHaveLength(2)
	expect(reportedMessages[0]).toStartWith("Failed query: insert into")
	expect(reportedMessages[1]).toBe("the sweep could not put a failed daily count batch back in Redis")
	expect(reportErrorSpy.mock.calls[1]?.[2]).toEqual({ dailyCountRowCount: "1" })
})
