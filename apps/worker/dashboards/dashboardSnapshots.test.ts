// the nightly Dashboard build: a private topic counts only in the full snapshot, an unchanged snapshot is not written
// again and only moves its day, what is no longer built is deleted, a build whose snapshots were deleted while it
// loaded writes nothing, only a public summary gets a share image, and the retention delete keeps 400 days
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DAILY_COUNT_RETENTION_DAYS } from "@carlnotes/contracts/dashboards"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as store from "@carlnotes/db/store"
import {
	deleteExpiredDailyCountsActivity,
	drawDashboardShareImagesActivity,
} from "../workflows/buildDashboardSnapshotsActivities"
import { toRangeFirstDay } from "./dashboardSeries"
import { buildDashboardSnapshots } from "./dashboardSnapshots"

// the last completed day every build counts up to, and the person whose Topic Dashboard it builds
const LAST_DAY = "2026-11-10"
const SUBJECT = { dashboardKind: "topicDashboard", subjectId: "user-1" } as const

afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// a topic's view row as the topic view read selects it, with its sketch of people as the fake Redis stores one
function toTopicViewRow(topicId: string, visibility: string, people: string[]): unknown[] {
	const sketch = Buffer.from(JSON.stringify(people))
	return [
		topicId,
		LAST_DAY,
		"unknown",
		null,
		null,
		null,
		null,
		null,
		people.length,
		sketch,
		topicId,
		topicId,
		visibility,
	]
}

// the rows for a public topic with two viewers, a private topic with one, and the saved snapshots given
function toBuildRows({ text }: SentQuery, savedRows: unknown[][] = []): unknown[] {
	if (text.includes('from "daily_view_counts" inner join "topics"')) {
		return [
			toTopicViewRow("topic-public", "public", ["u:a", "u:b"]),
			toTopicViewRow("topic-private", "private", ["u:c"]),
		]
	}

	// one public topic of two, then the saved snapshots, and no findings or Topic Posts
	if (text.includes('from "topics" where')) {
		return [[1, 2]]
	}
	if (text.includes('from "dashboard_snapshots"')) {
		return savedRows
	}
	return text.includes("count(*)") ? [[0, 0]] : []
}

// each written snapshot's selection, access level, body, and hash
function toWrittenSnapshots(sentQueries: SentQuery[]): { key: string; body: unknown; contentHash: string }[] {
	return sentQueries
		.filter(({ text }) => text.startsWith('insert into "dashboard_snapshots"'))
		.map(({ values }) => {
			const [selection, accessLevel, , body, contentHash] = values.slice(values.indexOf("user-1") + 1)
			return { key: `${selection}:${accessLevel}`, body: JSON.parse(String(body)), contentHash: String(contentHash) }
		})
}

test("a private topic counts in the full snapshot only, and an all-public kind writes no full snapshot", async () => {
	stubRedisClient()
	const sentQueries = stubConnectionPool((sentQuery) => toBuildRows(sentQuery))
	expect(await buildDashboardSnapshots(SUBJECT, LAST_DAY)).toEqual(["public", "full"])

	// the topic series and the summary differ by level, and the findings and Topic Posts have no full snapshot
	const writtenSnapshotByKey = new Map(toWrittenSnapshots(sentQueries).map(({ key, body }) => [key, body]))
	expect([...writtenSnapshotByKey.keys()].sort()).toEqual(
		["finding:public", "summary:full", "summary:public", "topic:full", "topic:public", "topicPost:public"].sort(),
	)
	expect(writtenSnapshotByKey.get("topic:public")).toMatchObject({ bars: [{ itemId: "topic-public", count: 2 }] })
	expect(writtenSnapshotByKey.get("topic:full")).toMatchObject({
		bars: [{ itemId: "topic-public" }, { itemId: "topic-private" }],
	})
	expect(writtenSnapshotByKey.get("summary:public")).toMatchObject({ topicCount: 1, viewerCount: 2 })
	expect(writtenSnapshotByKey.get("summary:full")).toMatchObject({ topicCount: 2, viewerCount: 3 })
})

test("a build whose snapshots are deleted while its daily counts load writes nothing", async () => {
	// a delete starts a new snapshot generation while the daily counts load
	const storedValueByKey = stubRedisClient()
	const sentQueries = stubConnectionPool((sentQuery) => {
		if (sentQuery.text.includes('from "daily_view_counts" inner join "topics"')) {
			storedValueByKey.set("dashboard-snapshot-generation:topicDashboard:user-1", "generation-after-delete")
		}
		return toBuildRows(sentQuery)
	})

	// the build changes no summary and writes no snapshot
	expect(await buildDashboardSnapshots(SUBJECT, LAST_DAY)).toEqual([])
	expect(toWrittenSnapshots(sentQueries)).toEqual([])
})

test("an unchanged build writes no snapshot, moves an earlier day's, and deletes one no longer built", async () => {
	stubRedisClient()
	const firstQueries = stubConnectionPool((sentQuery) => toBuildRows(sentQuery))
	await buildDashboardSnapshots(SUBJECT, LAST_DAY)

	// the second build reads the first build's hashes, the public summary's saved a day earlier, plus a full findings
	// snapshot it no longer builds
	const savedRows = toWrittenSnapshots(firstQueries).map(({ key, contentHash }) => {
		const [selection, accessLevel] = key.split(":")
		return [`id-${key}`, selection, accessLevel, contentHash, key === "summary:public" ? "2026-11-09" : LAST_DAY]
	})
	const sentQueries = stubConnectionPool((sentQuery) =>
		toBuildRows(sentQuery, [...savedRows, ["id-stale", "finding", "full", "hash", LAST_DAY]]),
	)
	expect(await buildDashboardSnapshots(SUBJECT, LAST_DAY)).toEqual([])

	// nothing is written again, the earlier summary moves to the last day, and the stale snapshot is deleted
	expect(toWrittenSnapshots(sentQueries)).toEqual([])
	const dayMoves = sentQueries.filter(({ text }) => text.startsWith('update "dashboard_snapshots" set "day"'))
	expect(dayMoves.map(({ values }) => [values[0], values.at(-1)])).toEqual([[LAST_DAY, "id-summary:public"]])
	const snapshotDeletes = sentQueries.filter(({ text }) => text.startsWith('delete from "dashboard_snapshots"'))
	expect(snapshotDeletes.map(({ values }) => values)).toEqual([["id-stale"]])
})

test("the retention delete keeps the last 400 days of daily view and play counts", async () => {
	const sentQueries = stubConnectionPool()
	await deleteExpiredDailyCountsActivity(LAST_DAY)
	const firstKeptDay = toRangeFirstDay(LAST_DAY, DAILY_COUNT_RETENTION_DAYS)
	expect(sentQueries.map(({ text, values }) => [text.split(" where")[0], values])).toEqual([
		['delete from "daily_view_counts"', [firstKeptDay]],
		['delete from "daily_play_counts"', [firstKeptDay]],
	])
})

test("a public summary's share image is drawn under its hash, and a full summary's is never drawn", async () => {
	// the public summary with an older image, and the public topic series with one bar
	const bars = [{ itemId: "topic-public", title: "Espresso grinders", path: "/topics/topic-public", count: 2 }]
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('select "selection"')
			? [
					["summary", {}, "hash-new", "dashboards/topicDashboard/user-1/hash-old.png"],
					["topic", { bars }, "hash-topic", null],
				]
			: [],
	)
	const uploadSpy = spyOn(store, "uploadAttachment").mockResolvedValue()
	await drawDashboardShareImagesActivity([
		{ ...SUBJECT, accessLevel: "full" },
		{ ...SUBJECT, accessLevel: "public" },
	])

	// one png uploaded for the public summary alone, saved on it, with the old image recorded for deletion
	const newImageKey = "dashboards/topicDashboard/user-1/hash-new.png"
	expect(uploadSpy.mock.calls.map(([key, , contentType]) => [key, contentType])).toEqual([[newImageKey, "image/png"]])
	const imageUpdate = sentQueries.find(({ text }) => text.startsWith('update "dashboard_snapshots" set "image_key"'))
	expect(imageUpdate?.values).toContain(newImageKey)
	expect(imageUpdate?.values).toContain("public")
	const pendingInserts = sentQueries.filter(({ text }) => text.startsWith('insert into "pending_object_deletions"'))
	expect(pendingInserts.map(({ values }) => values[0])).toEqual([
		newImageKey,
		"dashboards/topicDashboard/user-1/hash-old.png",
	])
})
