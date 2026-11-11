// the viewer count sync: a Redis restart merges the saved counter back before copying, and a column is never lowered
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as viewerCounts from "@carlnotes/db/viewerCounts"
import { addViewer, readViewerEstimate, takeChangedViewerCountRefs } from "@carlnotes/db/viewerCounts"
import { copyViewerCounts } from "./syncViewerCounts"

// the topic every test counts, and its counter as Postgres saved it before Redis restarted. the fake Redis stores a
// counter as a JSON array of its elements
const TOPIC_REF = { kind: "topic", id: "topic-1" } as const
const SAVED_COUNTER = Buffer.from(JSON.stringify(["u:saved-user"]))

afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

test("after a restart the saved counter merges back, and the copy writes the union with greatest", async () => {
	// Redis restarted empty, and one new visitor viewed the topic before the sync ran
	stubRedisClient()
	await addViewer(TOPIC_REF, "v:new-visitor")

	// Postgres holds the saved counter, and the topic's row is there to raise
	const sentQueries = stubConnectionPool((sentQuery) => {
		if (sentQuery.text.includes('from "viewer_counters"')) {
			return [["topic-1", null, null, null, SAVED_COUNTER]]
		}
		return sentQuery.text.startsWith('update "topics"') ? [["topic-1"]] : []
	})
	await copyViewerCounts()

	// the live count holds the saved viewer and the new one
	expect(await readViewerEstimate(TOPIC_REF)).toBe(2)

	// the column is raised to the union with greatest, so it never drops, and the counter is saved beside it
	const countUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topics"'))
	expect(countUpdate?.text).toContain("greatest(")
	expect(countUpdate?.values).toContain(2)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "viewer_counters"'))).toBe(true)
})

test("a topic deleted since its view is skipped, and the rest still save", async () => {
	stubRedisClient()
	await addViewer(TOPIC_REF, "u:user-1")
	await addViewer({ kind: "topic", id: "topic-gone" }, "u:user-1")

	// only topic-1 still has a row to raise, and Postgres has no saved counter to merge back
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith('update "topics"') && sentQuery.values.at(-1) === "topic-1" ? [["topic-1"]] : [],
	)
	await copyViewerCounts()

	// both count updates are sent, and only the topic that still exists saves its counter
	const countUpdates = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "topics"'))
	expect(countUpdates).toHaveLength(2)
	const counterInserts = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('insert into "viewer_counters"'))
	expect(counterInserts.map((counterInsert) => counterInsert.values.includes("topic-1"))).toEqual([true])
})

test("the first sync counts each topic's owner, so a topic nobody else opened still shows one viewer", async () => {
	// Redis starts empty, and Postgres records topic-1's owner and nothing else
	stubRedisClient()
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('select "id", "owner_id" from "topics"')) {
			return [["topic-1", "owner-1"]]
		}
		return text.startsWith('update "topics"') ? [["topic-1"]] : []
	})
	await copyViewerCounts()

	// the owner is counted, and the column is raised to one
	expect(await readViewerEstimate(TOPIC_REF)).toBe(1)
	const countUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topics"'))
	expect(countUpdate?.values).toContain(1)
})

test("a failed read lists only that ref as changed again, and the rest save", async () => {
	stubRedisClient()
	await addViewer(TOPIC_REF, "u:user-1")
	await addViewer({ kind: "topic", id: "topic-unread" }, "u:user-1")

	// the counter read of topic-unread fails, and topic-1 saves
	const readViewerCounter = viewerCounts.readViewerCounter
	spyOn(viewerCounts, "readViewerCounter").mockImplementation((viewerCountRef) =>
		viewerCountRef.id === "topic-unread" ? Promise.resolve(null) : readViewerCounter(viewerCountRef),
	)
	stubConnectionPool((sentQuery) => (sentQuery.text.startsWith('update "topics"') ? [["topic-1"]] : []))
	await copyViewerCounts()

	// only the failed ref waits for the next sync
	expect(await takeChangedViewerCountRefs()).toEqual([{ kind: "topic", id: "topic-unread" }])
})

test("a profile's and a team's viewers raise their own columns and save their own counters", async () => {
	stubRedisClient()
	await addViewer({ kind: "profile", id: "user-1" }, "v:visitor-1")
	await addViewer({ kind: "team", id: "team-1" }, "v:visitor-1")

	// both rows are there to raise, and Postgres has no saved counter to merge back
	const sentQueries = stubConnectionPool((sentQuery) => {
		if (sentQuery.text.startsWith('update "users"')) {
			return [["user-1"]]
		}
		return sentQuery.text.startsWith('update "teams"') ? [["team-1"]] : []
	})
	await copyViewerCounts()

	// each count is raised with greatest on its own table
	const profileUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "users"'))
	const teamUpdate = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "teams"'))
	expect(profileUpdate?.text).toContain('greatest("users"."profile_viewer_count"')
	expect(teamUpdate?.text).toContain('greatest("teams"."viewer_count"')

	// each counter is saved in the row that names its user or its team
	const counterInserts = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('insert into "viewer_counters"'))
	expect(counterInserts.some((counterInsert) => counterInsert.text.includes('"profile_user_id"'))).toBe(true)
	expect(counterInserts.some((counterInsert) => counterInsert.text.includes('"team_id"'))).toBe(true)
})

test("after a restart a profile's saved counter merges back before the copy", async () => {
	// Redis restarted empty, and one new visitor opened the profile before the sync ran
	stubRedisClient()
	const profileRef = { kind: "profile", id: "user-1" } as const
	await addViewer(profileRef, "v:new-visitor")

	// Postgres holds the profile's saved counter, and the user's row is there to raise
	stubConnectionPool((sentQuery) => {
		if (sentQuery.text.includes('from "viewer_counters"')) {
			return [[null, null, "user-1", null, SAVED_COUNTER]]
		}
		return sentQuery.text.startsWith('update "users"') ? [["user-1"]] : []
	})
	await copyViewerCounts()

	// the live count holds the saved viewer and the new one
	expect(await readViewerEstimate(profileRef)).toBe(2)
})
