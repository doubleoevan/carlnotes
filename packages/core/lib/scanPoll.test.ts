// a poll reload keeps what the page shows and the poll leaves out, each reader polls at its own rates, and the scan
// status reload reads the page only if the status changed
import { expect, test } from "bun:test"
import type { TopicPageResult } from "@carlnotes/client/topicClient"
import type { TopicScanStatusRead } from "@carlnotes/contracts/statusReads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	createTopicScanStatusReload,
	isPodcastEpisodePending,
	isTopicPageBehindScanStatus,
	toPodcastEpisodeStartWaitLeftMs,
	toPolledTopicPage,
	toPolledTopicPageResult,
	toScanPollMs,
	toWatchedScanPollMs,
} from "./scanPoll"

// the fields a full read of a page holds and a poll leaves out
const SHOWN_FIELDS = {
	relatedTopics: [{ id: "related-1", name: "Robot vacuums", latestPodcastEpisode: null }],
	reactions: { counts: [], ownReactionType: "like" },
	commentThread: { comments: [], nextCursor: "next-page", weekCommentCount: 2, sharedCommentSlots: null },
	topicPosts: { topicPosts: [], canPublish: true },
}

// a topic page with the given id and the fields a full read holds
function toFullTopicPage(id: string): TopicResponse {
	return { id, name: "Full read", ...SHOWN_FIELDS } as unknown as TopicResponse
}

// a poll's topic page with the given id, which has no related topics, reactions, comment thread, or Topic Posts
function toPolledTopic(id: string): TopicResponse {
	return { id, name: "Poll", relatedTopics: [] } as unknown as TopicResponse
}

test("a poll reload of the same topic takes the poll's fields and keeps what the poll leaves out", () => {
	const polledTopicPage = toPolledTopicPage(toFullTopicPage("topic-1"), toPolledTopic("topic-1"))
	expect(polledTopicPage).toMatchObject({ name: "Poll", ...SHOWN_FIELDS })
})

test("a poll reload keeps the page's comment thread and reactions as the same objects", () => {
	const fullTopicPage = toFullTopicPage("topic-1")
	const polledTopicPage = toPolledTopicPage(fullTopicPage, toPolledTopic("topic-1"))
	expect(polledTopicPage?.commentThread).toBe(fullTopicPage.commentThread)
	expect(polledTopicPage?.reactions).toBe(fullTopicPage.reactions)
})

test("a poll reload of another topic, or of a topic gone missing, keeps the reload's own", () => {
	expect(toPolledTopicPage(toFullTopicPage("topic-1"), toPolledTopic("topic-2"))?.commentThread).toBeUndefined()
	expect(toPolledTopicPage(undefined, toFullTopicPage("topic-2"))?.relatedTopics).toHaveLength(1)
	expect(toPolledTopicPage(toFullTopicPage("topic-1"), null)).toBeNull()
})

test("a polled page result keeps what the visible page shows, and a gated or missing result stays", () => {
	const visiblePage: TopicPageResult = { status: "visible", topic: toFullTopicPage("topic-1") }
	const polledPage: TopicPageResult = { status: "visible", topic: toPolledTopic("topic-1") }
	expect(toPolledTopicPageResult(visiblePage, polledPage)).toMatchObject({
		status: "visible",
		topic: { name: "Poll", ...SHOWN_FIELDS },
	})
	expect(toPolledTopicPageResult(undefined, polledPage)).toEqual(polledPage)
	expect(toPolledTopicPageResult(visiblePage, { status: "missing" })).toEqual({ status: "missing" })
})

test("a reader who may scan polls at three seconds, then ten after thirty seconds, then thirty after two minutes", () => {
	expect([0, 29_999, 30_000, 119_999, 120_000, 3_600_000].map(toScanPollMs)).toEqual([
		3000, 3000, 10_000, 10_000, 30_000, 30_000,
	])
})

test("a reader who may not scan polls at ten seconds, then thirty after two minutes", () => {
	expect([0, 29_999, 30_000, 119_999, 120_000, 3_600_000].map(toWatchedScanPollMs)).toEqual([
		10_000, 10_000, 10_000, 10_000, 30_000, 30_000,
	])
})

// a running Scan with the given counts, as the page and the status show it
const RUNNING_SCAN = { id: "scan-1", status: "running" as const, foundCount: 4, keptCount: 1 }

// a topic page that shows the given latest Scan
function toScanTopicPage(scan: typeof RUNNING_SCAN): TopicResponse {
	return { id: "topic-1", scans: [scan], podcast: null } as unknown as TopicResponse
}

// a scan status reload over a shown page and a list of status reads, which counts the page reads
function toCountedScanStatusReload(
	shownTopic: TopicResponse,
	topicScanStatuses: (TopicScanStatusRead | null)[],
): { reload: () => Promise<void>; readCounts: { page: number } } {
	const readCounts = { page: 0 }
	let statusReadCount = 0
	const reload = createTopicScanStatusReload({
		readShownTopic: () => shownTopic,
		readScanStatus: async () => topicScanStatuses[Math.min(statusReadCount++, topicScanStatuses.length - 1)] ?? null,
		reloadTopicPage: async () => {
			readCounts.page += 1
		},
	})
	return { reload, readCounts }
}

test("a signed-in user's poll sends no topic page read while the scan status matches the page", async () => {
	const { reload, readCounts } = toCountedScanStatusReload(toScanTopicPage(RUNNING_SCAN), [
		{ scan: RUNNING_SCAN, podcastEpisodeStatus: null },
	])

	// ten ticks of an unchanged scan read only the status
	for (let i = 0; i < 10; i++) {
		await reload()
	}
	expect(readCounts.page).toBe(0)
})

test("a changed count, status, or recording podcast episode reads the page, twice at most for one status", async () => {
	const moreFoundScan = { ...RUNNING_SCAN, foundCount: 9 }
	const { reload, readCounts } = toCountedScanStatusReload(toScanTopicPage(RUNNING_SCAN), [
		{ scan: moreFoundScan, podcastEpisodeStatus: null },
		{ scan: moreFoundScan, podcastEpisodeStatus: null },
		{ scan: moreFoundScan, podcastEpisodeStatus: null },
		{ scan: { ...RUNNING_SCAN, status: "succeeded" }, podcastEpisodeStatus: "recording" },
	])

	// a new count reads the page, and a page that still shows the old count is read once more, then not again
	await reload()
	expect(readCounts.page).toBe(1)
	await reload()
	await reload()
	expect(readCounts.page).toBe(2)

	// a finished Scan with a recording podcast episode is a new status, which reads the page
	await reload()
	expect(readCounts.page).toBe(3)
})

test("a failed status read reads the page, as the poll did before the status read", async () => {
	const { reload, readCounts } = toCountedScanStatusReload(toScanTopicPage(RUNNING_SCAN), [null])
	await reload()
	expect(readCounts.page).toBe(1)
})

test("a podcast episode recording on the page and no longer in the status leaves the page behind", () => {
	const recordingTopicPage = {
		...toScanTopicPage(RUNNING_SCAN),
		podcast: { unpublishedPodcastEpisode: { status: "recording" } },
	} as unknown as TopicResponse
	expect(
		isTopicPageBehindScanStatus(recordingTopicPage, { scan: RUNNING_SCAN, podcastEpisodeStatus: "recording" }),
	).toBe(false)
	expect(
		isTopicPageBehindScanStatus(recordingTopicPage, { scan: RUNNING_SCAN, podcastEpisodeStatus: "published" }),
	).toBe(true)
})

// a topic whose podcast is on, and whose latest scan succeeded the given time ago with no podcast episode yet
function toAwaitingTopic(finishedAgoMs: number): TopicResponse {
	const finishedAt = new Date(Date.now() - finishedAgoMs).toISOString()
	return {
		podcast: { isEnabled: true, unpublishedPodcastEpisode: null },
		scans: [{ status: "succeeded", finishedAt, podcastEpisode: null }],
	} as unknown as TopicResponse
}

test("the wait for a scan's podcast episode counts down, and ends 90 seconds after the scan", () => {
	// half a minute in, a minute is left and a podcast episode is pending
	const waitLeftMs = toPodcastEpisodeStartWaitLeftMs(toAwaitingTopic(30_000))
	expect(waitLeftMs).toBeGreaterThan(59_000)
	expect(waitLeftMs).toBeLessThanOrEqual(60_000)
	expect(isPodcastEpisodePending(toAwaitingTopic(30_000))).toBe(true)

	// past the wait, nothing is left and nothing is pending
	expect(toPodcastEpisodeStartWaitLeftMs(toAwaitingTopic(91_000))).toBe(0)
	expect(isPodcastEpisodePending(toAwaitingTopic(91_000))).toBe(false)
})

test("a failed page read does not count toward a status's page read limit", async () => {
	// a status the page never shows, whose page reads fail three times and then load
	const moreFoundScan = { ...RUNNING_SCAN, foundCount: 9 }
	let pageReadCount = 0
	const reload = createTopicScanStatusReload({
		readShownTopic: () => toScanTopicPage(RUNNING_SCAN),
		readScanStatus: async () => ({ scan: moreFoundScan, podcastEpisodeStatus: null }),
		reloadTopicPage: async () => {
			pageReadCount += 1
			if (pageReadCount <= 3) {
				throw new Error("offline")
			}
		},
	})

	// each failed read is tried again on the next tick, and the loaded reads still stop at the limit
	for (let i = 0; i < 8; i++) {
		await reload().catch(() => undefined)
	}
	expect(pageReadCount).toBe(5)
})

// a scan that just started refetches quickly, so the first findings land on screen without a wait
test("a new scan polls fast", () => {
	expect(toScanPollMs(0)).toBe(3000)
	expect(toScanPollMs(29_999)).toBe(3000)
})

// past the first half-minute the poll rate slows down, then down again
test("a longer scan slows the poll rate down", () => {
	expect(toScanPollMs(30_000)).toBe(10_000)
	expect(toScanPollMs(119_999)).toBe(10_000)
	expect(toScanPollMs(120_000)).toBe(30_000)
})

// a five-minute scan costs a fraction of what one rate would have
test("a five minute scan is far cheaper than a fixed fast poll", () => {
	// the ticks the stepped rate spends across five minutes, against 100 at a flat three seconds
	let watchedMs = 0
	let ticks = 0
	while (watchedMs < 300_000) {
		watchedMs += toScanPollMs(watchedMs)
		ticks += 1
	}
	expect(ticks).toBeLessThan(30)
})
