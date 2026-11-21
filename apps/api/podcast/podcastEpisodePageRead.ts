// a podcast episode's page read: the head with the page or its invite topic's gate, served to visitors from one copy per
// podcast episode
import type { PodcastEpisodePageRead } from "@carlnotes/contracts/pageReads"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import type { TopicGateResponse } from "@carlnotes/contracts/topics"
import {
	type PodcastEpisodePageAddress,
	readVisitorPage,
	toVisitorPodcastEpisodePageKey,
} from "@carlnotes/db/visitorPageCaches"
import { isAllowed } from "../authorization"
import { loadPodcastEpisodePageHead } from "../share/pageHead"
import { toTopicGateResponse } from "../topic/helpers"
import { overlayUncheckedPodcastEpisodePageImages } from "../uncheckedImageOverlays"
import { loadPodcastEpisodePage } from "./podcastEpisodePage"
import { loadPodcastEpisodePageRow } from "./podcastEpisodeRows"

// the podcast episode page that the user may listen to, the gate of its invite topic, or neither
type PodcastEpisodePageOrGate = {
	podcastEpisodePage: PodcastEpisodePageResponse | null
	topicGate: TopicGateResponse | null
}

// the user, null for a visitor, and the podcast episode by its topic, season, and number
type ReadPodcastEpisodePageReadOptions = { userId: string | null; podcastEpisodePageAddress: PodcastEpisodePageAddress }

/**
 * Loads a podcast episode's page as the user may see it, with an editor's unchecked uploads in place of its image and
 * its film's poster, or the gate of an invite topic they may not open. A private topic's and a missing podcast
 * episode's page holds neither.
 */
export async function loadPodcastEpisodePageOrGate({
	userId,
	podcastEpisodePageAddress,
}: ReadPodcastEpisodePageReadOptions): Promise<PodcastEpisodePageOrGate> {
	// the page if the user may listen to the podcast episode
	const podcastEpisodePage = await loadPodcastEpisodePage(podcastEpisodePageAddress, userId)
	if (podcastEpisodePage) {
		return {
			podcastEpisodePage: await overlayUncheckedPodcastEpisodePageImages(podcastEpisodePage, userId),
			topicGate: null,
		}
	}

	// the gate of an invite topic that the user may not open, which names the topic. the page's own row read is shared
	// through the request memo
	const podcastEpisodePageRow = await loadPodcastEpisodePageRow(podcastEpisodePageAddress)
	const podcastEpisodeTopic = podcastEpisodePageRow?.topic
	const isTopicHidden =
		podcastEpisodeTopic !== undefined && !(await isAllowed(userId, "topic:view", podcastEpisodeTopic))
	const topicGate = isTopicHidden && podcastEpisodeTopic ? toTopicGateResponse(podcastEpisodeTopic) : null
	return { podcastEpisodePage: null, topicGate }
}

/**
 * Returns a podcast episode's page read, or null if its topic has no published podcast episode there. A visitor's read
 * of a podcast episode they may listen to is served from its copy. A user's read is built for them and never stored.
 */
export async function readPodcastEpisodePageRead({
	userId,
	podcastEpisodePageAddress,
}: ReadPodcastEpisodePageReadOptions): Promise<PodcastEpisodePageRead | null> {
	if (userId) {
		return buildPodcastEpisodePageRead({ userId, podcastEpisodePageAddress })
	}
	return readVisitorPage({
		key: toVisitorPodcastEpisodePageKey(podcastEpisodePageAddress),
		pageKind: "podcastEpisode",
		load: () => buildPodcastEpisodePageRead({ userId: null, podcastEpisodePageAddress }),
		isShared: (podcastEpisodePageRead) => Boolean(podcastEpisodePageRead?.podcastEpisodePage),
	})
}

// build the head and the page view together. no head means no published podcast episode there
async function buildPodcastEpisodePageRead({
	userId,
	podcastEpisodePageAddress,
}: ReadPodcastEpisodePageReadOptions): Promise<PodcastEpisodePageRead | null> {
	const [head, podcastEpisodePageView] = await Promise.all([
		loadPodcastEpisodePageHead(podcastEpisodePageAddress),
		loadPodcastEpisodePageOrGate({ userId, podcastEpisodePageAddress }),
	])
	return head ? { head, ...podcastEpisodePageView } : null
}
