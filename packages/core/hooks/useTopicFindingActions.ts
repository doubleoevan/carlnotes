import { showClientError } from "@carlnotes/client/apiClient"
import type { PodcastEpisodePageResult } from "@carlnotes/client/podcastEpisodeClient"
import type { TopicPageResult } from "@carlnotes/client/topicClient"
import {
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
} from "@carlnotes/client/topicFindingClient"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import {
	type InfiniteData,
	onlineManager,
	type QueryClient,
	useMutation,
	useMutationState,
	useQueryClient,
} from "@tanstack/react-query"
import { useCallback, useMemo, useRef } from "react"
import {
	applyFindingChanges,
	applySearchFindingChanges,
	applyTopicFeedChanges,
	applyTopicPageChanges,
	type TopicFindingChange,
} from "../lib/topicFindingChanges"

// the handlers existing feed components share
export type TopicFeedHandlers = {
	openTopicFinding: (findingId: string) => void
	consumeTopicFinding: (findingId: string, isConsumed: boolean) => void
	rateTopicFinding: (findingId: string, rating: "up" | "down" | null) => void
	bookmarkTopicFinding: (findingId: string, isBookmarked: boolean) => void
}
export type UseTopicFindingActionsOptions = {
	userId: string | null
	shouldUpdateOptimistically?: boolean
	onChangeConfirmed?: (change: TopicFindingChange) => void
}
type SendFindingChangeOptions = { change: TopicFindingChange; shouldThrowOnError: boolean }
type CommitFindingChangeOptions = { queryClient: QueryClient; userId: string | null; change: TopicFindingChange }
export type TopicFindingActions = { handlers: TopicFeedHandlers; pendingChanges: TopicFindingChange[] }

/**
 * Shares finding writes and optional optimistic presentation across reading screens.
 */
export function useTopicFindingActions({
	userId,
	shouldUpdateOptimistically = false,
	onChangeConfirmed,
}: UseTopicFindingActionsOptions): TopicFindingActions {
	// scope writes and pending presentation to this account's query client
	const queryClient = useQueryClient()
	const pendingFindings = useRef(new Set<string>()).current
	const mutationKey = useMemo(() => ["topic-finding", userId], [userId])
	const mutation = useMutation({
		mutationKey,
		retry: false,
		networkMode: "always",
		mutationFn: (change: TopicFindingChange) =>
			sendFindingChange({ change, shouldThrowOnError: shouldUpdateOptimistically }),
		onSuccess: (_response, change) => {
			if (shouldUpdateOptimistically) {
				commitFindingChange({ queryClient, userId, change })
			} else {
				void queryClient.invalidateQueries({ queryKey: ["topic-feed"] })
			}
			onChangeConfirmed?.(change)
		},
		onError: (error) => console.error("topic finding action failed", error),
		onSettled: (_response, _error, change) => {
			pendingFindings.delete(toPendingFindingKey(change))
		},
	})

	// reject repeated presses synchronously, before a render can disable the control
	const handleChange = useCallback(
		(change: TopicFindingChange): void => {
			// allow independent actions while suppressing a repeated press
			const pendingKey = toPendingFindingKey(change)
			if (shouldUpdateOptimistically && pendingFindings.has(pendingKey)) {
				return
			}
			pendingFindings.add(pendingKey)
			mutation.mutate(change)
		},
		[mutation.mutate, shouldUpdateOptimistically, pendingFindings],
	)
	const handlers = useMemo(() => toFindingHandlers(handleChange), [handleChange])
	const pendingChanges = useMutationState<TopicFindingChange>({
		filters: { mutationKey, status: "pending" },
		select: (pendingMutation) => pendingMutation.state.variables as TopicFindingChange,
	})
	return { handlers, pendingChanges: shouldUpdateOptimistically ? pendingChanges : [] }
}

/**
 * Returns finding handlers that reload a separately owned page after each write.
 */
export function usePageTopicFeedHandlers(reloadPage: () => void | Promise<void>): TopicFeedHandlers {
	return useMemo(
		() =>
			toFindingHandlers((change) => {
				void sendFindingChange({ change, shouldThrowOnError: false })
					.then(reloadPage)
					.catch((error) => console.error("topic finding action failed", error))
			}),
		[reloadPage],
	)
}

// identify each action independently of the finding's other writes
function toPendingFindingKey(change: TopicFindingChange): string {
	return `${change.findingId}:${change.kind}`
}

// adapt the components' existing callbacks to one action contract
function toFindingHandlers(onChange: (change: TopicFindingChange) => void): TopicFeedHandlers {
	return {
		openTopicFinding: (findingId) => onChange({ kind: "opened", findingId }),
		consumeTopicFinding: (findingId, isConsumed) => onChange({ kind: "consumed", findingId, isConsumed }),
		rateTopicFinding: (findingId, rating) => onChange({ kind: "rating", findingId, rating }),
		bookmarkTopicFinding: (findingId, isBookmarked) => onChange({ kind: "bookmark", findingId, isBookmarked }),
	}
}

// send an action once, without an offline queue
async function sendFindingChange({ change, shouldThrowOnError }: SendFindingChangeOptions): Promise<void> {
	if (shouldThrowOnError && !onlineManager.isOnline()) {
		if (change.kind !== "opened") {
			showClientError("That didn't save. Carl suggests trying again.")
		}
		throw new Error("finding write is offline")
	}

	// preserve the transport's existing error presentation
	const options = { ...change, shouldThrowOnError }
	switch (options.kind) {
		case "opened":
			return sendTopicFindingOpened(options)
		case "consumed":
			return sendTopicFindingConsumed(options)
		case "bookmark":
			return sendTopicFindingBookmark(options)
		case "rating":
			return sendTopicFindingRating(options)
	}
}

// save acknowledged fields before reconciling, keeping a failed read from undoing the write
function commitFindingChange({ queryClient, userId, change }: CommitFindingChangeOptions): void {
	// cancel older reads before saving the acknowledged change
	void queryClient.cancelQueries({ queryKey: ["topic-feed", userId] })
	void queryClient.cancelQueries({ queryKey: ["topic-page", userId] })
	void queryClient.cancelQueries({ queryKey: ["site-search", userId] })
	void queryClient.cancelQueries({ queryKey: ["podcast-episode-page", userId] })
	queryClient.setQueriesData<TopicFeedResponse>(
		{ queryKey: ["topic-feed", userId] },
		(topicFeed) => applyTopicFeedChanges(topicFeed ?? null, [change]) ?? undefined,
	)
	queryClient.setQueriesData<TopicPageResult>({ queryKey: ["topic-page", userId] }, (topicPage) =>
		applyTopicPageChanges(topicPage, [change]),
	)
	queryClient.setQueriesData<InfiniteData<SearchResultsPage>>({ queryKey: ["site-search", userId] }, (searchResults) =>
		searchResults
			? { ...searchResults, pages: searchResults.pages.map((page) => applySearchFindingChanges(page, [change])) }
			: undefined,
	)

	queryClient.setQueriesData<PodcastEpisodePageResult>({ queryKey: ["podcast-episode-page", userId] }, (page) =>
		page?.status === "visible"
			? {
					...page,
					podcastEpisodePage: {
						...page.podcastEpisodePage,
						topicFindings: page.podcastEpisodePage.topicFindings.map((finding) =>
							applyFindingChanges(finding, [change]),
						),
					},
				}
			: page,
	)

	// reconcile active reads without delaying settlement of the action
	void queryClient.invalidateQueries({ queryKey: ["topic-feed", userId] })
	void queryClient.invalidateQueries({ queryKey: ["topic-page", userId] })
	void queryClient.invalidateQueries({ queryKey: ["site-search", userId] })
	void queryClient.invalidateQueries({ queryKey: ["podcast-episode-page", userId] })
}
