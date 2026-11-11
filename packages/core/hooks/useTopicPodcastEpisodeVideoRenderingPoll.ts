// the reads of a page while it shows a podcast episode whose film is rendering, so the film player shows once the
// film is ready
import { useEffect, useRef } from "react"
import { startLimitedPoll } from "../lib/limitedPoll"

// how often a page reads again while a film renders
export const TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_POLL_MS = 30_000

// how long a page reads again for one film before it stops: the time limit of one render attempt
const TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_POLL_LIMIT_MS = 4 * 60 * 60 * 1000

/**
 * Reads a page again on an interval while a film renders and the app is focused and online, until the poll's time
 * limit, and returns the call that stops the reads.
 */
export function startTopicPodcastEpisodeVideoRenderingPoll(readPageAgain: () => void | Promise<void>): () => void {
	return startLimitedPoll({
		read: readPageAgain,
		pollMs: TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_POLL_MS,
		limitMs: TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_POLL_LIMIT_MS,
	})
}

// whether the page shows a film that is rendering, and the read of the page again, which the next read waits for
type UseTopicPodcastEpisodeVideoRenderingPollOptions = {
	isVideoRendering: boolean
	onPoll: () => void | Promise<void>
}

/**
 * Reads a page again on an interval while the film it shows is rendering. The reads pause while the app is in the
 * background or offline, and stop at their time limit.
 */
export function useTopicPodcastEpisodeVideoRenderingPoll({
	isVideoRendering,
	onPoll,
}: UseTopicPodcastEpisodeVideoRenderingPollOptions): void {
	// keep the latest read, so a new callback never restarts the poll
	const onPollRef = useRef(onPoll)
	useEffect(() => {
		onPollRef.current = onPoll
	}, [onPoll])

	// read the page again while the film renders
	useEffect(() => {
		if (!isVideoRendering) {
			return
		}
		return startTopicPodcastEpisodeVideoRenderingPoll(() => onPollRef.current())
	}, [isVideoRendering])
}
