import {
	fetchPodcastFeedUrl,
	isPodcastEpisodeAccessDenied,
	sendResetPodcastFeed,
} from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisodeFormat, PodcastFeedUrlResponse } from "@carlnotes/contracts/podcast"
import { useEffect, useRef, useState } from "react"

// the dialog's podcast feed url, the film feed's url if the Topic has a film, and the feed the listener chose
type FeedState = {
	key: string
	url: string | null
	videoUrl: string | null
	format: PodcastEpisodeFormat
	// the dialog's progress and its message
	isLoading: boolean
	isResetting: boolean
	isConfirmingReset: boolean
	message: string | null
}
export type PodcastFeedState = Omit<FeedState, "key"> & {
	// the chosen feed's url, which the app link and Copy feed link use
	chosenFeedUrl: string | null
	chooseFormat: (format: PodcastEpisodeFormat) => void
	confirmReset: () => void
	cancelReset: () => void
	reset: () => Promise<void>
}

/**
 * Loads a permitted podcast feed and film feed and confirms resets while retiring old account and dialog requests.
 */
export function usePodcastFeed({ topicId, userId }: { topicId: string; userId: string | null }): PodcastFeedState {
	// bind the private link and outstanding requests to this account and Topic
	const key = `${userId ?? "visitor"}:${topicId}`
	const [state, setState] = useState<FeedState>(() => toEmptyFeed(key))
	const request = useRef<AbortController | null>(null)
	const isResetting = useRef(false)
	useEffect(() => {
		// clear the previous private link before starting this dialog's request
		const controller = new AbortController()
		request.current = controller
		isResetting.current = false
		setState(toEmptyFeed(key))

		// load the feed urls, and drop a result that settles after the request is aborted
		void fetchPodcastFeedUrl(topicId, { shouldThrowOnError: true, signal: controller.signal })
			.then((podcastFeedUrls) => {
				if (!controller.signal.aborted) {
					setState({ ...toEmptyFeed(key), ...toFeedUrls(podcastFeedUrls), isLoading: false })
				}
			})
			// a failed load shows no link
			.catch(() => {
				if (!controller.signal.aborted) {
					setState({ ...toEmptyFeed(key), isLoading: false })
				}
			})
		return () => controller.abort()
	}, [key, topicId])

	// freeze the confirm action synchronously so a second tap cannot reset twice
	const reset = async (): Promise<void> => {
		const controller = request.current
		if (
			!controller ||
			controller.signal.aborted ||
			isResetting.current ||
			// reset only a link that this account and Topic confirmed
			state.key !== key ||
			!state.isConfirmingReset
		) {
			return
		}

		// send the reset and show the new link
		isResetting.current = true
		setState((current) => ({ ...current, isResetting: true, message: null }))
		try {
			const podcastFeedUrls = await sendResetPodcastFeed(topicId, {
				shouldThrowOnError: true,
				signal: controller.signal,
			})

			// drop a result that settles after the request is aborted
			if (controller.signal.aborted) {
				return
			}
			setState((current) => ({
				...current,
				...(podcastFeedUrls ? toFeedUrls(podcastFeedUrls) : {}),
				isResetting: false,
				isConfirmingReset: false,
				message: podcastFeedUrls
					? "New link made. The old one stopped working."
					: "The link did not change. Try again.",
			}))
		} catch (error) {
			if (controller.signal.aborted) {
				return
			}
			setState((current) => ({
				...current,
				...(isPodcastEpisodeAccessDenied(error) ? { url: null, videoUrl: null } : {}),
				isResetting: false,
				isConfirmingReset: false,
				message: "The link did not change. Try again.",
			}))
		} finally {
			if (request.current === controller) {
				isResetting.current = false
			}
		}
	}
	// the current account's feed, and the film feed's url once the listener chooses Films
	const currentState = state.key === key ? state : toEmptyFeed(key)
	const chosenFeedUrl =
		currentState.format === "video" && currentState.videoUrl ? currentState.videoUrl : currentState.url
	return {
		...currentState,
		chosenFeedUrl,
		chooseFormat: (format) => setState((current) => ({ ...current, format })),
		confirmReset: () => setState((current) => ({ ...current, isConfirmingReset: Boolean(current.url) })),
		cancelReset: () => {
			if (!isResetting.current) {
				setState((current) => ({ ...current, isConfirmingReset: false }))
			}
		},
		reset,
	}
}

function toEmptyFeed(key: string): FeedState {
	return {
		key,
		url: null,
		videoUrl: null,
		format: "audio",
		isLoading: true,
		isResetting: false,
		isConfirmingReset: false,
		message: null,
	}
}

// the podcast feed's url and the film feed's url, or none if the urls did not load
function toFeedUrls(podcastFeedUrls: PodcastFeedUrlResponse | null): Pick<FeedState, "url" | "videoUrl"> {
	return { url: podcastFeedUrls?.podcastFeedUrl ?? null, videoUrl: podcastFeedUrls?.podcastVideoFeedUrl ?? null }
}
