// the reads of a film's status while a page shows a podcast episode whose film is rendering, and the read of the page
// once the film leaves rendering, so the film player shows once the film is ready
import { fetchTopicVideoStatus } from "@carlnotes/client/statusReadClient"
import type { TopicVideoStatusRead } from "@carlnotes/contracts/statusReads"
import { STATUS_FIRST_POLL_MS } from "@carlnotes/contracts/statusReads"
import { useEffect } from "react"
import { startStatusPoll } from "../lib/statusPoll"
import { useStableCallback } from "./useStableCallback"

// how often a page reads the film's status while a film renders
export const TOPIC_VIDEO_RENDERING_POLL_MS = STATUS_FIRST_POLL_MS.topicVideo

// how long a page reads again for one film before it stops: the time limit of one render attempt
const TOPIC_VIDEO_RENDERING_POLL_LIMIT_MS = 4 * 60 * 60 * 1000

// the read of the film's status, null for a failed read, and the read of the page, which the next read waits for
type StartTopicVideoRenderingPollOptions = {
	readStatus: () => Promise<TopicVideoStatusRead | null>
	readPageAgain: () => void | Promise<void>
}

/**
 * Reads a film's status on an interval while the app is focused and online, until the poll's time limit, and reads
 * the page once the film leaves rendering. A failed status read stops the poll. Returns the call that stops the reads.
 */
export function startTopicVideoRenderingPoll({
	readStatus,
	readPageAgain,
}: StartTopicVideoRenderingPollOptions): () => void {
	return startStatusPoll({
		readStatus,
		isInProgress: ({ status }) => status === "rendering",
		readPage: readPageAgain,
		pollMs: TOPIC_VIDEO_RENDERING_POLL_MS,
		limitMs: TOPIC_VIDEO_RENDERING_POLL_LIMIT_MS,
	})
}

// the podcast episode whose film renders, whether its Topic is public, which reads the status without credentials,
// whether the page shows a film that is rendering, the read of the page again, which the next read waits for, and
// whether the poll may run, which a covered screen turns off
type UseTopicVideoRenderingPollOptions = {
	podcastEpisodeId: string | undefined
	isTopicPublic: boolean
	isVideoRendering: boolean
	onPoll: () => void | Promise<void>
	isEnabled?: boolean
}

/**
 * Reads a film's status on an interval while the page shows it rendering, and reads the page again once it leaves
 * rendering. The reads pause while the app is in the background or offline, and stop at their time limit, on a
 * failed status read, and while the poll is not enabled.
 */
export function useTopicVideoRenderingPoll({
	podcastEpisodeId,
	isTopicPublic,
	isVideoRendering,
	onPoll,
	isEnabled = true,
}: UseTopicVideoRenderingPollOptions): void {
	// keep the latest read of the page, so a new callback never restarts the poll
	const readPageAgain = useStableCallback(onPoll)

	// read the film's status while the film renders
	useEffect(() => {
		if (!(isVideoRendering && isEnabled && podcastEpisodeId)) {
			return
		}
		return startTopicVideoRenderingPoll({
			readStatus: () => fetchTopicVideoStatus({ id: podcastEpisodeId, isPublic: isTopicPublic }),
			readPageAgain,
		})
	}, [isVideoRendering, isEnabled, podcastEpisodeId, isTopicPublic, readPageAgain])
}
