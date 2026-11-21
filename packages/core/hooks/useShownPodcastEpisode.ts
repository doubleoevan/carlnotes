import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toDiscussionTopicPostId } from "@carlnotes/contracts/topicPosts"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useEffect, useState } from "react"
import { startLimitedPoll } from "../lib/limitedPoll"
import { isManualScanShown } from "../lib/topicActions"
import { usePodcastEpisodePlayer } from "../stores/podcastEpisodePlayerStore"

// the polling interval for a linked podcast episode that is still recording, and how long the page polls it before it
// stops
export const PODCAST_EPISODE_RECORDING_POLL_MS = 5_000
const RECORDING_POLL_LIMIT_MS = 60 * 60 * 1000

/**
 * Reads a linked podcast episode that is still recording on an interval while the app is focused and online, until it
 * stops recording or the poll's time limit. The read returns whether the podcast episode still records. Returns the
 * call that stops the reads.
 */
export function startRecordingPodcastEpisodePoll(readPodcastEpisode: () => Promise<boolean>): () => void {
	const stopPoll = startLimitedPoll({
		read: async () => {
			// a podcast episode that stopped recording ends the poll
			if (!(await readPodcastEpisode())) {
				stopPoll()
			}
		},
		pollMs: PODCAST_EPISODE_RECORDING_POLL_MS,
		limitMs: RECORDING_POLL_LIMIT_MS,
	})
	return stopPoll
}

// the podcast episode that the player shows, and whether a running scan is about to record an episode instead
export type ShownPodcastEpisodeState = { podcastEpisode: PodcastEpisode | null; willScanRecordPodcastEpisode: boolean }

// the podcast episode that the player shows. this topic's loaded episode comes first, then the linked episode,
// then a recording episode, then a running scan's next episode, then a failed episode, then the latest episode.
// a Topic Post's discussion loaded in the player is no episode of the topic's podcast, so it is never shown here
/**
 * Selects the podcast episode shown for a Topic and follows a linked recording until it publishes, pausing while the app is in
 * the background, until the poll's time limit.
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

	// the linked episode, once it is the one this topic and this url name
	const linkedPodcastEpisode =
		linkedPodcastEpisodeState?.topicId === topic.id &&
		linkedPodcastEpisodeState.podcastEpisodeId === linkedPodcastEpisodeId
			? linkedPodcastEpisodeState.podcastEpisode
			: null

	// the episode loaded in the player, and the topic the linked episode has to belong to
	const { podcastEpisode: loadedPodcastEpisode } = usePodcastEpisodePlayer()
	const topicId = topic.id
	useEffect(() => {
		// clear the linked podcast episode if the url names none
		if (!linkedPodcastEpisodeId || !isActive) {
			setLinkedPodcastEpisodeState(null)
			return
		}

		// load the linked podcast episode, and return whether it still records
		const controller = new AbortController()
		let stopRecordingPoll = (): void => {}
		const loadLinkedPodcastEpisode = async (): Promise<boolean> => {
			const fetchedPodcastEpisode = await fetchPodcastEpisode(linkedPodcastEpisodeId, {
				signal: controller.signal,
			}).catch(() => null)
			if (controller.signal.aborted) {
				return false
			}

			// keep the linked podcast episode only if the episode is this topic's
			const topicPodcastEpisode = fetchedPodcastEpisode?.topicId === topicId ? fetchedPodcastEpisode : null
			setLinkedPodcastEpisodeState({
				topicId,
				podcastEpisodeId: linkedPodcastEpisodeId,
				podcastEpisode: topicPodcastEpisode,
			})
			return topicPodcastEpisode?.status === "recording"
		}

		// poll again while the podcast episode is recording
		void loadLinkedPodcastEpisode().then((isRecording) => {
			if (isRecording && !controller.signal.aborted) {
				stopRecordingPoll = startRecordingPodcastEpisodePoll(loadLinkedPodcastEpisode)
			}
		})

		// stop the poll when the linked podcast episode changes
		return () => {
			controller.abort()
			stopRecordingPoll()
		}
	}, [linkedPodcastEpisodeId, topicId, isActive])

	return toShownPodcastEpisode({ topic, linkedPodcastEpisode, loadedPodcastEpisode })
}

/**
 * Returns the episode loaded in the player if it is an episode of this Topic's podcast, or null. A Topic Post's
 * discussion plays in the docked player alone, so the Topic's podcast section keeps its own episode.
 */
export function toTopicLoadedPodcastEpisode(
	topicId: string,
	loadedPodcastEpisode: PodcastEpisode | null,
): PodcastEpisode | null {
	// a discussion is held under an id that names its post, and an episode of the podcast is not
	const isTopicPodcastEpisode =
		loadedPodcastEpisode?.topicId === topicId && !toDiscussionTopicPostId(loadedPodcastEpisode.id)
	return isTopicPodcastEpisode ? loadedPodcastEpisode : null
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
	const topicLoadedPodcastEpisode = toTopicLoadedPodcastEpisode(topic.id, loadedPodcastEpisode)
	const recordingPodcastEpisode = unpublishedPodcastEpisode?.status === "recording" ? unpublishedPodcastEpisode : null

	// the first of the three that exists is the one shown
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
