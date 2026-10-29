import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useEffect, useState } from "react"
import { isManualScanShown } from "../lib/topicActions"
import { usePodcastEpisodePlayer } from "../stores/podcastEpisodePlayerStore"

// the polling interval for a linked episode that is still recording
const RECORDING_POLL_MS = 5_000

// the podcast episode that the player shows, and whether a running scan is about to record an episode instead
export type ShownPodcastEpisodeState = { podcastEpisode: PodcastEpisode | null; willScanRecordPodcastEpisode: boolean }

// the podcast episode that the player shows. this topic's loaded episode comes first, then the linked episode,
// then a recording episode, then a running scan's next episode, then a failed episode, then the latest episode
/**
 * Selects the episode shown for a Topic and follows a linked recording until it publishes.
 */
export function useShownPodcastEpisode({
	topic,
	linkedPodcastEpisodeId = null,
	isActive = true,
}: {
	topic: TopicResponse
	linkedPodcastEpisodeId?: string | null
	isActive?: boolean
}): ShownPodcastEpisodeState {
	// keep the linked selection owned by its topic and request
	const [linkedPodcastEpisodeState, setLinkedPodcastEpisodeState] = useState<{
		topicId: string
		podcastEpisodeId: string
		podcastEpisode: PodcastEpisode | null
	} | null>(null)
	const linkedPodcastEpisode =
		linkedPodcastEpisodeState?.topicId === topic.id &&
		linkedPodcastEpisodeState.podcastEpisodeId === linkedPodcastEpisodeId
			? linkedPodcastEpisodeState.podcastEpisode
			: null
	const { podcastEpisode: loadedPodcastEpisode } = usePodcastEpisodePlayer()
	const topicId = topic.id
	useEffect(() => {
		// clear the linked podcast episode if the url names none
		if (!linkedPodcastEpisodeId || !isActive) {
			setLinkedPodcastEpisodeState(null)
			return
		}

		// load the linked podcast episode, and poll again while the episode is recording
		const controller = new AbortController()
		let recordingPollTimer: ReturnType<typeof setTimeout> | undefined
		const loadLinkedPodcastEpisode = async (): Promise<void> => {
			const fetchedPodcastEpisode = await fetchPodcastEpisode(linkedPodcastEpisodeId, {
				signal: controller.signal,
			}).catch(() => null)
			if (controller.signal.aborted) {
				return
			}

			// keep the linked podcast episode only if the episode is this topic's
			const topicPodcastEpisode = fetchedPodcastEpisode?.topicId === topicId ? fetchedPodcastEpisode : null
			setLinkedPodcastEpisodeState({
				topicId,
				podcastEpisodeId: linkedPodcastEpisodeId,
				podcastEpisode: topicPodcastEpisode,
			})
			if (topicPodcastEpisode?.status === "recording") {
				recordingPollTimer = setTimeout(loadLinkedPodcastEpisode, RECORDING_POLL_MS)
			}
		}
		void loadLinkedPodcastEpisode()

		// stop the poll when the linked podcast episode changes
		return () => {
			controller.abort()
			clearTimeout(recordingPollTimer)
		}
	}, [linkedPodcastEpisodeId, topicId, isActive])

	return toShownPodcastEpisode({ topic, linkedPodcastEpisode, loadedPodcastEpisode })
}

/**
 * Selects the loaded, linked, recording, pending, failed, or latest episode in that order.
 */
export function toShownPodcastEpisode({
	topic,
	linkedPodcastEpisode,
	loadedPodcastEpisode,
}: {
	topic: TopicResponse
	linkedPodcastEpisode: PodcastEpisode | null
	loadedPodcastEpisode: PodcastEpisode | null
}): ShownPodcastEpisodeState {
	// this topic's loaded podcast episode, the linked episode, or the episode that is recording
	const { podcast } = topic
	const unpublishedPodcastEpisode = podcast?.unpublishedPodcastEpisode ?? null
	const topicLoadedPodcastEpisode = loadedPodcastEpisode?.topicId === topic.id ? loadedPodcastEpisode : null
	const recordingPodcastEpisode = unpublishedPodcastEpisode?.status === "recording" ? unpublishedPodcastEpisode : null
	const shownPodcastEpisode =
		topicLoadedPodcastEpisode ??
		(linkedPodcastEpisode?.topicId === topic.id ? linkedPodcastEpisode : null) ??
		recordingPodcastEpisode
	if (shownPodcastEpisode) {
		return { podcastEpisode: shownPodcastEpisode, willScanRecordPodcastEpisode: false }
	}

	// a running scan is about to record an episode if the podcast is on
	const isScanRunning = topic.scans.some((topicScan) => topicScan.status === "running")
	if (isScanRunning && podcast?.isEnabled) {
		return { podcastEpisode: null, willScanRecordPodcastEpisode: true }
	}

	// a podcast episode that failed to record shows only to a user who may scan the topic.
	// every other user gets the latest episode
	const failedPodcastEpisode = isManualScanShown(topic) ? unpublishedPodcastEpisode : null
	return {
		podcastEpisode: failedPodcastEpisode ?? topic.latestPodcastEpisode,
		willScanRecordPodcastEpisode: false,
	}
}
