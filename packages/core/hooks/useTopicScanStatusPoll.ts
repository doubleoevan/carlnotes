// the reload and the rates of a topic page's scan poll: each tick reads the Topic's scan status, and reads the topic
// page only if the page shows less than the status
import { fetchTopicScanStatus } from "@carlnotes/client/statusReadClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useEffect, useMemo, useReducer } from "react"
import {
	createTopicScanStatusReload,
	isPodcastEpisodePending,
	toPodcastEpisodeStartWaitLeftMs,
	toScanPollMs,
	toWatchedScanPollMs,
} from "../lib/scanPoll"
import { isManualScanShown } from "../lib/topicActions"
import { useStableCallback } from "./useStableCallback"

// the topic page as it shows now, and the read of the topic page as a poll
type UseTopicScanStatusPollOptions = {
	topic: TopicResponse | null | undefined
	reloadTopicPage: () => Promise<void>
}

// the reload each tick runs, the wait before the next tick given how long the poll has run, and whether a podcast
// episode of the topic is recording or may still start
type TopicScanStatusPoll = {
	reload: () => Promise<void>
	toPollMs: (watchedMs: number) => number
	isPodcastEpisodePending: boolean
}

/**
 * Returns a scan poll's reload, which reads the Topic's scan status and the topic page only if the status changed,
 * and its rates: a reader who may scan the topic polls at the scan rates, and any other reader at the watched rates.
 * A public Topic's status is read without credentials by every reader but one who may scan it, so the edge may share
 * it. The reload keeps its identity while the topic stays the same, so the poll does not restart. The hook renders
 * again once the wait for a scan's podcast episode ends, so a poll that reads no new page still stops.
 */
export function useTopicScanStatusPoll({ topic, reloadTopicPage }: UseTopicScanStatusPollOptions): TopicScanStatusPoll {
	// keep the latest page and page read, so a render never restarts the poll
	const readShownTopic = useStableCallback(() => topic)
	const reloadLatestTopicPage = useStableCallback(reloadTopicPage)

	// the reader who may scan polls at the scan rates and reads with credentials
	const topicId = topic?.id
	const isScanner = isManualScanShown(topic)
	const isPublic = topic?.visibility === "public" && !isScanner
	const reload = useMemo(
		() =>
			createTopicScanStatusReload({
				readShownTopic,
				readScanStatus: async () => (topicId ? fetchTopicScanStatus({ id: topicId, isPublic }) : null),
				reloadTopicPage: reloadLatestTopicPage,
			}),
		[topicId, isPublic, readShownTopic, reloadLatestTopicPage],
	)

	// render again when the wait for the latest scan's podcast episode ends, which no poll tick may cause
	const [, renderAgain] = useReducer((renderCount: number) => renderCount + 1, 0)
	const podcastEpisodeStartWaitLeftMs = toPodcastEpisodeStartWaitLeftMs(topic)

	// set a timer for the end of that wait, if the wait has not ended
	useEffect(() => {
		if (podcastEpisodeStartWaitLeftMs === 0) {
			return
		}
		const timeout = setTimeout(renderAgain, podcastEpisodeStartWaitLeftMs)
		return () => clearTimeout(timeout)
	}, [podcastEpisodeStartWaitLeftMs])

	// the reload, its rates, and whether a podcast episode of the topic is still pending
	return {
		reload,
		toPollMs: isScanner ? toScanPollMs : toWatchedScanPollMs,
		isPodcastEpisodePending: isPodcastEpisodePending(topic),
	}
}
