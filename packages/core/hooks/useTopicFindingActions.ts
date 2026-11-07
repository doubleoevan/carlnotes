import { showClientError } from "@carlnotes/client/apiClient"
import { WRITE_FAILED_TEXT } from "@carlnotes/client/clientWrite"
import type { PodcastEpisodePageResult } from "@carlnotes/client/podcastEpisodeClient"
import type { TopicPageResult } from "@carlnotes/client/topicClient"
import {
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
} from "@carlnotes/client/topicFindingClient"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import type { ReactionSummary } from "@carlnotes/contracts/social"
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
	applyPodcastEpisodePageChanges,
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
	// keeps the summary a finding's reaction save returned wherever the finding's data lives
	keepTopicFindingReactions: (findingId: string, reactions: ReactionSummary) => void
}
export type UseTopicFindingActionsOptions = {
	userId: string | null
	shouldUpdateOptimistically?: boolean
	onChangeConfirmed?: (change: TopicFindingChange) => void
}
// the changes that send a write of their own. a reaction's summary comes from a write that already ended
type TopicFindingWrite = Exclude<TopicFindingChange, { kind: "reactions" }>
type SendFindingChangeOptions = { change: TopicFindingWrite; shouldThrowOnError: boolean }
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
		mutationFn: (change: TopicFindingWrite) =>
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
			// keep a saved reaction's summary in the caches with no write or read of its own
			if (change.kind === "reactions") {
				writeFindingChange({ queryClient, userId, change })
				onChangeConfirmed?.(change)
				return
			}

			// allow independent actions while suppressing a repeated press
			const pendingKey = toPendingFindingKey(change)
			if (shouldUpdateOptimistically && pendingFindings.has(pendingKey)) {
				return
			}
			pendingFindings.add(pendingKey)
			mutation.mutate(change)
		},
		[mutation.mutate, shouldUpdateOptimistically, pendingFindings, queryClient, userId, onChangeConfirmed],
	)
	const handlers = useMemo(() => toFindingHandlers(handleChange), [handleChange])
	const pendingChanges = useMutationState<TopicFindingChange>({
		filters: { mutationKey, status: "pending" },
		select: (pendingMutation) => pendingMutation.state.variables as TopicFindingChange,
	})
	return { handlers, pendingChanges: shouldUpdateOptimistically ? pendingChanges : [] }
}

/**
 * Returns finding handlers that reload a separately owned page after each write. A saved reaction's summary goes to
 * the page's own change handler with no read.
 */
export function usePageTopicFeedHandlers(
	reloadPage: () => void | Promise<void>,
	onFindingChange: (change: TopicFindingChange) => void,
): TopicFeedHandlers {
	return useMemo(
		() =>
			toFindingHandlers((change) => {
				if (change.kind === "reactions") {
					onFindingChange(change)
					return
				}

				// send the write, then read the page again
				void sendFindingChange({ change, shouldThrowOnError: false })
					.then(reloadPage)
					.catch((error) => console.error("topic finding action failed", error))
			}),
		[reloadPage, onFindingChange],
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
		keepTopicFindingReactions: (findingId, reactions) => onChange({ kind: "reactions", findingId, reactions }),
	}
}

// send an action once, without an offline queue
async function sendFindingChange({ change, shouldThrowOnError }: SendFindingChangeOptions): Promise<void> {
	if (shouldThrowOnError && !onlineManager.isOnline()) {
		if (change.kind !== "opened") {
			showClientError(WRITE_FAILED_TEXT)
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

		// a bookmark and a rating each save through their own route
		case "bookmark":
			return sendTopicFindingBookmark(options)
		case "rating":
			return sendTopicFindingRating(options)
	}
}

// the query roots of every cached read that holds a finding
const FINDING_QUERY_ROOTS = ["topic-feed", "topic-page", "site-search", "podcast-episode-page"]

// save acknowledged fields before reconciling, keeping a failed read from undoing the write
function commitFindingChange({ queryClient, userId, change }: CommitFindingChangeOptions): void {
	// cancel older reads before saving the acknowledged change
	const findingQueryKeys = FINDING_QUERY_ROOTS.map((queryRoot) => [queryRoot, userId])
	for (const queryKey of findingQueryKeys) {
		void queryClient.cancelQueries({ queryKey })
	}
	writeFindingChange({ queryClient, userId, change })

	// reconcile active reads without delaying settlement of the action
	for (const queryKey of findingQueryKeys) {
		void queryClient.invalidateQueries({ queryKey })
	}
}

// write a finding's change into every cached read that holds the finding
function writeFindingChange({ queryClient, userId, change }: CommitFindingChangeOptions): void {
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
			? { ...page, podcastEpisodePage: applyPodcastEpisodePageChanges(page.podcastEpisodePage, [change]) }
			: page,
	)
}
