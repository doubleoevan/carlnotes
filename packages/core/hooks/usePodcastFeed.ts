import {
	fetchPodcastFeedUrl,
	isPodcastEpisodeAccessDenied,
	sendResetPodcastFeed,
} from "@carlnotes/client/podcastEpisodeClient"
import { useEffect, useRef, useState } from "react"

type FeedState = {
	key: string
	url: string | null
	isLoading: boolean
	isResetting: boolean
	isConfirmingReset: boolean
	message: string | null
}
export type PodcastFeedState = Omit<FeedState, "key"> & {
	confirmReset: () => void
	cancelReset: () => void
	reset: () => Promise<void>
}

/**
 * Loads a permitted podcast feed and confirms resets while retiring old account and dialog requests.
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
		void fetchPodcastFeedUrl(topicId, { shouldThrowOnError: true, signal: controller.signal })
			.then((url) => {
				if (!controller.signal.aborted) {
					setState({ ...toEmptyFeed(key), url, isLoading: false })
				}
			})
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
			state.key !== key ||
			!state.isConfirmingReset
		) {
			return
		}
		isResetting.current = true
		setState((current) => ({ ...current, isResetting: true, message: null }))
		try {
			const url = await sendResetPodcastFeed(topicId, { shouldThrowOnError: true, signal: controller.signal })
			if (controller.signal.aborted) {
				return
			}
			setState((current) => ({
				...current,
				url: url ?? current.url,
				isResetting: false,
				isConfirmingReset: false,
				message: url ? "New link made. The old one stopped working." : "The link did not change. Try again.",
			}))
		} catch (error) {
			if (controller.signal.aborted) {
				return
			}
			setState((current) => ({
				...current,
				url: isPodcastEpisodeAccessDenied(error) ? null : current.url,
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
	return {
		...(state.key === key ? state : toEmptyFeed(key)),
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
	return { key, url: null, isLoading: true, isResetting: false, isConfirmingReset: false, message: null }
}
