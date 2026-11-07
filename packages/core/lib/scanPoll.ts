import type { TopicPageResult } from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"

// how often to re-fetch the page while a scan is running
// a polled scan shows its first findings within seconds, and a long one is not worth as fast of a refetch.
// the rate steps down the longer the scan runs.
const FAST_POLL_MS = 3000
const MEDIUM_POLL_MS = 10_000
const SLOW_POLL_MS = 30_000

// how long the topic scan poll holds each of the first two poll rates before slowing down
const FAST_POLL_UNTIL_MS = 30_000
const MEDIUM_POLL_UNTIL_MS = 120_000

/**
 * Returns the refetch delay based on how long the scan has been watched.
 */
export function toScanPollMs(watchedMs: number): number {
	if (watchedMs < FAST_POLL_UNTIL_MS) {
		return FAST_POLL_MS
	}
	return watchedMs < MEDIUM_POLL_UNTIL_MS ? MEDIUM_POLL_MS : SLOW_POLL_MS
}

/**
 * Returns a poll reload's topic page with the related topics, the reactions, and the comment thread of the page it
 * replaces, which a poll leaves out. A topic the page did not show keeps the reload's own.
 */
export function toPolledTopicPage(
	previousTopic: TopicResponse | null | undefined,
	polledTopic: TopicResponse | null,
): TopicResponse | null {
	if (!polledTopic || previousTopic?.id !== polledTopic.id) {
		return polledTopic
	}
	const { relatedTopics, reactions, commentThread } = previousTopic
	return { ...polledTopic, relatedTopics, reactions, commentThread }
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
