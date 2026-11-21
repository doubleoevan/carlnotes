import type { TopicPageResult } from "@carlnotes/client/topicClient"
import { STATUS_FIRST_POLL_MS, type TopicScanStatusRead } from "@carlnotes/contracts/statusReads"
import type { TopicResponse } from "@carlnotes/contracts/topics"

// how often to re-fetch the page while a scan is running
// a polled scan shows its first findings within seconds, and a long one is not worth as fast of a refetch.
// the rate steps down the longer the scan runs.
const FAST_POLL_MS = STATUS_FIRST_POLL_MS.scan
const MEDIUM_POLL_MS = 10_000
const SLOW_POLL_MS = 30_000

// how long the topic scan poll holds each of the first two poll rates before slowing down
const FAST_POLL_UNTIL_MS = 30_000
const MEDIUM_POLL_UNTIL_MS = 120_000

// how long after a scan finishes the page keeps looking for the podcast episode that the scan starts
const PODCAST_EPISODE_START_WAIT_MS = 90_000

// how many times the poll reads the page for one status that the page still does not show, so a page that never
// catches up, such as one whose reader may not see the podcast episode that records, is not read on every tick
const STATUS_PAGE_READ_LIMIT = 2

/**
 * Returns the refetch delay based on how long the scan has been watched.
 */
export function toScanPollMs(watchedMs: number): number {
	return watchedMs < FAST_POLL_UNTIL_MS ? FAST_POLL_MS : toWatchedScanPollMs(watchedMs)
}

/**
 * Returns the refetch delay for a reader who may not scan the topic and watches someone else's scan: the medium rate,
 * then the slow rate after two minutes.
 */
export function toWatchedScanPollMs(watchedMs: number): number {
	return watchedMs < MEDIUM_POLL_UNTIL_MS ? MEDIUM_POLL_MS : SLOW_POLL_MS
}

/**
 * Returns whether a podcast episode of this topic is recording, or its latest scan just finished and may still start
 * one.
 */
export function isPodcastEpisodePending(topic: TopicResponse | null | undefined): boolean {
	return topic?.podcast?.unpublishedPodcastEpisode?.status === "recording" || toPodcastEpisodeStartWaitLeftMs(topic) > 0
}

/**
 * Returns how long the page keeps waiting for the podcast episode that its topic's latest scan may start, or 0 for a
 * topic with no podcast, a latest scan that did not succeed or already has its podcast episode, or a wait that ended.
 */
export function toPodcastEpisodeStartWaitLeftMs(topic: TopicResponse | null | undefined): number {
	// a topic whose podcast is on, and whose latest scan succeeded with no podcast episode yet
	const [latestScan] = topic?.scans ?? []
	if (!topic?.podcast?.isEnabled || latestScan?.status !== "succeeded" || latestScan.podcastEpisode) {
		return 0
	}

	// the time left of the wait after the scan finished
	const elapsedSinceScanMs = latestScan.finishedAt ? Date.now() - new Date(latestScan.finishedAt).getTime() : null
	return elapsedSinceScanMs === null ? 0 : Math.max(0, PODCAST_EPISODE_START_WAIT_MS - elapsedSinceScanMs)
}

/**
 * Returns whether the topic page shows less than the Topic's scan status: another latest Scan, another status or
 * count of it, or a podcast episode that started or stopped recording.
 */
export function isTopicPageBehindScanStatus(topic: TopicResponse, topicScanStatus: TopicScanStatusRead): boolean {
	// the latest Scan the page shows against the status's
	const [shownScan] = topic.scans
	const statusScan = topicScanStatus.scan

	// a status Scan the page does not show, or shows with another status or count, and a page Scan the status lacks
	const isScanBehind = statusScan
		? shownScan?.id !== statusScan.id ||
			shownScan.status !== statusScan.status ||
			shownScan.foundCount !== statusScan.foundCount ||
			shownScan.keptCount !== statusScan.keptCount
		: shownScan !== undefined

	// a podcast episode recording on the page against the status's
	const isShownRecording = topic.podcast?.unpublishedPodcastEpisode?.status === "recording"
	return isScanBehind || isShownRecording !== (topicScanStatus.podcastEpisodeStatus === "recording")
}

// the topic page as it shows now, the read of the Topic's scan status, null for a failed read, and the read of the
// topic page again
type CreateTopicScanStatusReloadOptions = {
	readShownTopic: () => TopicResponse | null | undefined
	readScanStatus: () => Promise<TopicScanStatusRead | null>
	reloadTopicPage: () => Promise<void>
}

/**
 * Returns the reload a scan poll runs on each tick: it reads the Topic's scan status, and reads the topic page only if
 * the page shows less than the status. A failed status read reads the page.
 */
export function createTopicScanStatusReload({
	readShownTopic,
	readScanStatus,
	reloadTopicPage,
}: CreateTopicScanStatusReloadOptions): () => Promise<void> {
	// the last status the page was read for, and how many times
	let readStatusKey = ""
	let statusPageReadCount = 0
	return async () => {
		// a failed status read falls back to the page
		const topicScanStatus = await readScanStatus()
		const shownTopic = readShownTopic()
		if (!topicScanStatus || !shownTopic) {
			return reloadTopicPage()
		}
		if (!isTopicPageBehindScanStatus(shownTopic, topicScanStatus)) {
			return
		}

		// read the page for a new status, and again up to the limit for one the page still does not show
		// a read counts once it loads, so a failed read is tried again
		const statusKey = JSON.stringify(topicScanStatus)
		const nextPageReadCount = statusKey === readStatusKey ? statusPageReadCount + 1 : 1
		if (nextPageReadCount > STATUS_PAGE_READ_LIMIT) {
			return
		}
		// read the page, then count the read for its status
		await reloadTopicPage()
		readStatusKey = statusKey
		statusPageReadCount = nextPageReadCount
	}
}

/**
 * Returns a poll reload's topic page with the related topics, the reactions, the comment thread, and the Topic Posts
 * of the page it replaces, which a poll leaves out. A topic the page did not show keeps the reload's own.
 */
export function toPolledTopicPage(
	previousTopic: TopicResponse | null | undefined,
	polledTopic: TopicResponse | null,
): TopicResponse | null {
	if (!polledTopic || previousTopic?.id !== polledTopic.id) {
		return polledTopic
	}
	const { relatedTopics, reactions, commentThread, topicPosts, topicPostsPage } = previousTopic
	return { ...polledTopic, relatedTopics, reactions, commentThread, topicPosts, topicPostsPage }
}

/**
 * Returns a poll reload's page result with what the visible page it replaces shows. A gated or missing result stays.
 */
export function toPolledTopicPageResult(
	previousResult: TopicPageResult | undefined,
	polledResult: TopicPageResult,
): TopicPageResult {
	const previousTopic = previousResult?.status === "visible" ? previousResult.topic : null
	const polledTopic = polledResult.status === "visible" ? polledResult.topic : null
	const topic = toPolledTopicPage(previousTopic, polledTopic)
	return topic ? { status: "visible", topic } : polledResult
}
