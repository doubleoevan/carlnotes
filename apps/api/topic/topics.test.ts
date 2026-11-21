// topic tests for the api

import { afterEach, expect, test } from "bun:test"
import { TOPIC_SCANS_PAGE_SIZE } from "@carlnotes/contracts/cardPages"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import type { TopicResponse, TopicScan } from "@carlnotes/contracts/topics"
import { appUrl } from "@carlnotes/server/appUrl"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toLastSucceededTopicScan, toLastTopicScanFields } from "./helpers"
import { isTakingDailySlot } from "./saveHelpers"
import { notifyIndexNowOfTopicChange } from "./saveTopic"
import { toPagedTopicPage } from "./topicPageRead"
import { toTopicScanRowsQuery } from "./topicScanRows"

// a scan history row, varied only by the status and id each test needs
function scanRow(id: string, status: TopicScan["status"]): TopicScan {
	return {
		id,
		status,
		startedAt: "2026-07-24T12:00:00.000Z",
		finishedAt: "2026-07-24T12:01:00.000Z",
		stoppedAt: null,
		// the counts, cost, and failure reason the page reads
		foundCount: 0,
		keptCount: 0,
		filteredCount: 0,
		costDollars: null,
		error: null,
		podcastEpisode: null,
	}
}

// scheduling counts a failed scan as the window spent, but the page's baseline stays the last succeeded scan
test("toLastSucceededScan skips a newer failed scan", () => {
	const history = [scanRow("newest-failed", "failed"), scanRow("succeeded", "succeeded"), scanRow("older", "succeeded")]
	expect(toLastSucceededTopicScan(history)?.id).toBe("succeeded")
})

// a history with nothing succeeded yet has no baseline to report
test("toLastSucceededScan is undefined when no scan has succeeded", () => {
	expect(toLastSucceededTopicScan([scanRow("failed", "failed"), scanRow("running", "running")])).toBeUndefined()
})

// the recap that the scan read found goes on the page beside the latest succeeded scan
test("the recap the scan read found is the note, and the schedule still reads the latest scan", () => {
	const history = [scanRow("quiet", "succeeded"), scanRow("failed", "failed"), scanRow("noted", "succeeded")]
	const lastTopicScanFields = toLastTopicScanFields(history, "Two new grinders this week.")
	expect(lastTopicScanFields.scanSummary).toBe("Two new grinders this week.")
	expect(lastTopicScanFields.lastSucceededTopicScan?.id).toBe("quiet")

	// a topic whose scans wrote no recap yet has no note, and a history with no succeeded scan has none either
	expect(toLastTopicScanFields([scanRow("quiet", "succeeded")], null).scanSummary).toBe(null)
	expect(toLastTopicScanFields([scanRow("failed", "failed")], "An older recap.").scanSummary).toBe(null)
})

// how many times a query's text names the scan recap column
function toScanSummaryColumnCount(querySql: string): number {
	return querySql.split('"scan_summary"').length - 1
}

// a poll's cache miss reads no scan's recap as a row column, and one recap in the newest row's subquery
test("a poll's scan read reads one recap, and a head read reads two", () => {
	const topic = { id: "topic-1", visibility: "public" as const }
	const pollQuerySql = toTopicScanRowsQuery({ topic, userId: "user-1", isHeadRead: false }).toSQL().sql
	expect(toScanSummaryColumnCount(pollQuerySql)).toBe(2)
	expect(pollQuerySql).toContain('select "scans"."scan_summary" from "scans" where')
	expect(pollQuerySql).not.toMatch(/"scans"\."scan_summary",/)

	// the newest succeeded scan that kept findings adds the head's one recap
	const headQuerySql = toTopicScanRowsQuery({ topic, userId: null, isHeadRead: true }).toSQL().sql
	expect(toScanSummaryColumnCount(headQuerySql)).toBe(4)
})

// a read that asks for a page of scans reads one page of the history and counts its scans, and a read that asks for none
// reads every scan
test("a paged scan read reads one page of the history with its count, and an unpaged one reads every scan", () => {
	// a paged read leaves out a stopped scan, counts the history's scans, and reads its page's limit and offset
	const topic = { id: "topic-1", visibility: "public" as const }
	const pagedQuery = toTopicScanRowsQuery({ topic, userId: null, isHeadRead: false, scansPage: 2 }).toSQL()
	expect(pagedQuery.sql).toContain("count(*) over ()")
	expect(pagedQuery.sql).toContain('"scans"."stopped_at" is null) order by')
	expect(pagedQuery.sql).toMatch(/limit \$\d+ offset \$\d+$/)
	expect(pagedQuery.params.slice(-2)).toEqual([TOPIC_SCANS_PAGE_SIZE, 2 * TOPIC_SCANS_PAGE_SIZE])

	// a read with no page reads every scan with no count
	const wholeQuerySql = toTopicScanRowsQuery({ topic, userId: null, isHeadRead: false }).toSQL().sql
	expect(wholeQuerySql).not.toMatch(/offset \$\d+$/)
	expect(wholeQuerySql).not.toContain("count(*) over ()")
	expect(wholeQuerySql).not.toContain('"scans"."stopped_at" is null) order by')
})

// a paged read holds one page of the Topic Posts with where it sits, and a poll's page, which has none, stays whole
test("a paged topic page holds one page of its Topic Posts, and a poll's page stays as it is", () => {
	const topicPostCards = Array.from({ length: 8 }, (_, i) => ({ id: `post-${i}` }) as TopicPostCard)
	const topicPage = { id: "topic-1", topicPosts: { topicPosts: topicPostCards, canPublish: true } } as TopicResponse
	const pagedTopicPage = toPagedTopicPage(topicPage, 1)
	expect(pagedTopicPage.topicPosts?.topicPosts.map(({ id }) => id)).toEqual(["post-6", "post-7"])
	expect(pagedTopicPage.topicPosts?.canPublish).toBe(true)
	expect(pagedTopicPage.topicPostsPage).toEqual({ page: 1, totalCount: 8 })

	// a poll's page has no Topic Posts to page
	const pollTopicPage = { id: "topic-1" } as TopicResponse
	expect(toPagedTopicPage(pollTopicPage, 1)).toBe(pollTopicPage)
})

// only a move to a daily frequency takes one of the plan's daily slots
test("isTakingDailySlot fires only on a move to a daily frequency", () => {
	// a new topic has no current frequency, so asking for a daily frequency takes a slot
	expect(isTakingDailySlot("daily")).toBe(true)
	expect(isTakingDailySlot("weekdays")).toBe(true)
	expect(isTakingDailySlot("weekly")).toBe(false)

	// moving a weekly topic onto either daily or weekdays frequency takes a slot
	expect(isTakingDailySlot("daily", "weekly")).toBe(true)
	expect(isTakingDailySlot("weekdays", "weekly")).toBe(true)
})

// a topic already on a daily frequency keeps the slot it holds, however many slots its owner has.
test("isTakingDailySlot never fires for a topic already on a daily frequency", () => {
	// re-saving the same frequency takes nothing, and so does moving between the two daily frequencies
	expect(isTakingDailySlot("daily", "daily")).toBe(false)
	expect(isTakingDailySlot("weekdays", "weekdays")).toBe(false)
	expect(isTakingDailySlot("daily", "weekdays")).toBe(false)
	expect(isTakingDailySlot("weekdays", "daily")).toBe(false)

	// giving a slot up takes nothing either
	expect(isTakingDailySlot("weekly", "daily")).toBe(false)
})

// the real fetch and key to put back after every test, and the url list of each post the recorder keeps
const realFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["INDEXNOW_KEY"])
const recordedUrlLists: unknown[] = []

// put the key and fetch back after every test
afterEach(() => {
	// restore the real fetch, and clear the recorded url lists
	globalThis.fetch = realFetch
	recordedUrlLists.length = 0

	// restore the real key, or remove the key if there was none
	restoreEnvSettings()
})

// report a topic save with a key and a fetch recorder, then wait for the post to go out
async function notifyTopicSave(topicChange: Parameters<typeof notifyIndexNowOfTopicChange>[0]): Promise<void> {
	// a key, and a fetch that keeps each post's url list
	Bun.env.INDEXNOW_KEY = "k3y"
	globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
		recordedUrlLists.push(JSON.parse(String(init?.body)).urlList)
		return new Response("", { status: 200 })
	}) as typeof fetch

	// report the save, and let the post it starts without awaiting settle
	notifyIndexNowOfTopicChange(topicChange)
	await Bun.sleep(0)
}

// a rename moves a public topic's page, so IndexNow gets the new url and the old one in one post
test("notifyIndexNowOfTopicChange sends the new and old urls when a public topic is renamed", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "Coding Agents", visibility: "public" },
		previousTopic: { name: "AI Agents", visibility: "public" },
	})
	expect(recordedUrlLists).toEqual([[`${appUrl()}/topics/t1/coding-agents`, `${appUrl()}/topics/t1/ai-agents`]])
})

// a private topic had no indexed page, so turning it public sends only the new url
test("notifyIndexNowOfTopicChange sends only the new url when a private topic turns public", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "AI Agents", visibility: "public" },
		previousTopic: { name: "AI Agents", visibility: "private" },
	})
	expect(recordedUrlLists).toEqual([[`${appUrl()}/topics/t1/ai-agents`]])
})

// a public topic saved under the same name keeps its url, so nothing is sent
test("notifyIndexNowOfTopicChange sends nothing when a public topic keeps its name", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "AI Agents", visibility: "public" },
		previousTopic: { name: "AI Agents", visibility: "public" },
	})
	expect(recordedUrlLists).toHaveLength(0)
})

// only a public topic's page is indexed, so a topic that stays private or invite sends nothing
test("notifyIndexNowOfTopicChange sends nothing for a private or invite topic", async () => {
	// a new invite topic, and a private topic renamed
	await notifyTopicSave({ savedTopic: { id: "t2", name: "AI Agents", visibility: "invite" }, previousTopic: null })
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "Coding Agents", visibility: "private" },
		previousTopic: { name: "AI Agents", visibility: "private" },
	})

	expect(recordedUrlLists).toHaveLength(0)
})

// a public topic made private leaves the index, so its old url is sent
test("notifyIndexNowOfTopicChange sends the old url when a public topic turns private", async () => {
	await notifyTopicSave({
		savedTopic: { id: "t1", name: "Coding Agents", visibility: "private" },
		previousTopic: { name: "AI Agents", visibility: "public" },
	})

	expect(recordedUrlLists).toEqual([[`${appUrl()}/topics/t1/ai-agents`]])
})
