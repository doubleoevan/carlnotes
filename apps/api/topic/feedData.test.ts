// the feed card's read of each topic's last succeeded scan: the schedule's columns from the latest one, and the recap
// from the newest one that wrote a recap
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadLastSucceededScanRows } from "./feedData"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// a scan that reviewed nothing writes no recap, and the card keeps the note of the scan before it
test("the feed card reads the newest recap that was written beside the latest succeeded scan", async () => {
	// one topic whose latest succeeded scan started and finished a minute apart
	const startedAt = new Date("2026-11-19T09:00:00Z")
	const finishedAt = new Date("2026-11-19T09:01:00Z")
	const sentQueries = stubConnectionPool(() => [
		["topic-1", startedAt, finishedAt, "Two new grinders this week.", "0.11"],
	])
	expect(await loadLastSucceededScanRows(["topic-1"])).toEqual([
		{ topicId: "topic-1", startedAt, finishedAt, scanSummary: "Two new grinders this week.", cost: "0.11" },
	])

	// the recap is its own read of the topic's succeeded scans, newest first, past every empty one, and runs once on
	// each topic instead of on every succeeded scan
	const [{ text } = { text: "" }] = sentQueries
	expect(text).toContain(
		`(select "recap_scans"."scan_summary" from "scans" "recap_scans" where "recap_scans"."topic_id" = "topics"."id" and "recap_scans"."status" = 'succeeded' and "recap_scans"."scan_summary" <> '' order by "recap_scans"."started_at" desc limit 1)`,
	)

	// the other columns are each topic's latest succeeded scan's, from a lateral read stopped at one row
	expect(text).toStartWith('select "topics"."id", "latest_scans"."started_at", "latest_scans"."finished_at", (select')
	expect(text).toContain(
		'from "topics" inner join lateral (select "started_at", "finished_at", "cost" from "scans" where ("scans"."topic_id" = "topics"."id"',
	)
	expect(text).toContain(
		'order by "scans"."started_at" desc limit $2) "latest_scans" on true where "topics"."id" in ($3)',
	)
})
