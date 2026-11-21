// what a screen shows from a page read: the page, the gate in front of its topic, or no such page at all
import type { PodcastEpisodePageResult } from "@carlnotes/client/podcastEpisodeClient"
import type { TopicGate, TopicPageResult } from "@carlnotes/client/topicClient"
import type { PodcastEpisodePageRead, TopicPageRead } from "@carlnotes/contracts/pageReads"
import type { TopicGateResponse } from "@carlnotes/contracts/topics"
import type { PodcastEpisodeCounts, TopicCounts } from "@carlnotes/contracts/viewerCounts"

/**
 * Returns a topic page read as the topic, its invite gate, or a missing topic for no read or a private topic's.
 */
export function toTopicPageResult(topicPageRead: TopicPageRead | null): TopicPageResult {
	if (topicPageRead?.topic) {
		return { status: "visible", topic: topicPageRead.topic }
	}
	return toGatedOrMissing(topicPageRead?.topicGate ?? null)
}

/**
 * Returns a podcast episode page read as the page, its topic's invite gate, or a missing podcast episode for no read or
 * a private topic's.
 */
export function toPodcastEpisodePageResult(
	podcastEpisodePageRead: PodcastEpisodePageRead | null,
): PodcastEpisodePageResult {
	if (podcastEpisodePageRead?.podcastEpisodePage) {
		return { status: "visible", podcastEpisodePage: podcastEpisodePageRead.podcastEpisodePage }
	}
	return toGatedOrMissing(podcastEpisodePageRead?.topicGate ?? null)
}

/**
 * Returns the listener count a podcast episode page was read with, as the counts its poll shows first, or null if the
 * page includes none.
 */
export function toSavedPodcastEpisodeCounts(listenerCount: number | undefined): PodcastEpisodeCounts | null {
	return listenerCount === undefined ? null : { listenerCount }
}

/**
 * Returns the viewer and follower counts a topic page was read with, as the counts its poll shows first, or null if
 * the page includes no viewer count.
 */
export function toSavedTopicCounts({
	viewerCount,
	subscriberCount,
}: {
	viewerCount?: number
	subscriberCount: number
}): TopicCounts | null {
	return viewerCount === undefined ? null : { viewerCount, subscriberCount }
}

// the gate in front of an invite topic, or a missing page
function toGatedOrMissing(
	topicGate: TopicGateResponse | null,
): { status: "gated"; topicGate: TopicGate } | { status: "missing" } {
	return topicGate ? { status: "gated", topicGate: { topicName: topicGate.topicName } } : { status: "missing" }
}
