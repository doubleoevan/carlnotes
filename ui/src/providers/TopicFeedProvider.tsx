import type { TopicFeedResponse } from "@shared/contracts"
import { resourceKinds as allResourceKinds } from "@shared/enums"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { authClient } from "@/lib/authClient"
import {
	fetchTopicFeed,
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
} from "@/lib/topicClient"
import { type FeedView, type FindingSort, matchesFeedView, toSortedFindings } from "@/lib/utils"

// the resource kinds that the Filters menu toggles
export type ResourceKind = (typeof allResourceKinds)[number]

// how selected tag filters match a topic: carrying any of them, all of them, none of them, or off to ignore tag filtering
export const tagMatchModes = ["any", "all", "none", "off"] as const
export type TagMatchMode = (typeof tagMatchModes)[number]

// the actions a topic feed resource can trigger. bundled so that components can share these handlers
export type TopicFeedHandlers = {
	openTopicFinding: (findingId: string) => void
	consumeTopicFinding: (findingId: string, isConsumed: boolean) => void
	rateTopicFinding: (findingId: string, rating: "up" | "down" | null) => void
	bookmarkTopicFinding: (findingId: string, isBookmarked: boolean) => void
}

// shape of the topic feed context derived from the hook's return type
type TopicFeedValue = ReturnType<typeof useTopicFeedState>
// the topic feed context shares one state instance via a single top-level provider, null unless set
const TopicFeedContext = createContext<TopicFeedValue | null>(null)

// owns the single topic feed instance and shares it with all descendant components
export function TopicFeedProvider({ children }: { children: ReactNode }) {
	return <TopicFeedContext.Provider value={useTopicFeedState()}>{children}</TopicFeedContext.Provider>
}

// returns the shared topic feed context value. throws if used outside of the provider
export function useTopicFeed(): TopicFeedValue {
	const contextValue = useContext(TopicFeedContext)
	if (!contextValue) {
		throw new Error("useTopicFeed must be used inside a <TopicFeedProvider>")
	}
	return contextValue
}

// returns the topic feed handlers. throws if used outside the provider
export function useTopicFeedActions(): TopicFeedHandlers {
	return useTopicFeed().handlers
}

// whether the viewer is signed in, used to hide per-user finding controls from signed-out visitors
export function useIsSignedIn(): boolean {
	return useTopicFeed().isSignedIn
}

// the topic feed state the provider owns: data, the view and sort toggles, the resource kind filters, the tag filters, and the topic finding handlers
function useTopicFeedState() {
	// like Gmail, shows everything by default with consumed rows muted. Unread narrows to unconsumed, Bookmarked to bookmarks
	const [view, setView] = useState<FeedView>("all")
	// how findings order within the pinned and unbookmarked groups. read-side only, never persisted
	const [sort, setSort] = useState<FindingSort>("relevant")
	const [resourceKinds, setResourceKinds] = useState<Set<ResourceKind>>(new Set(allResourceKinds))
	// the feed watches the session itself — no route guard unmounts it, so "yours" would otherwise go stale on sign-out
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// selected tag filters and how they match: topics carrying any, all, or none of them
	const [tagFilters, setTagFilters] = useState<string[]>([])
	const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("any")

	// tanstack caches the topic feed keyed by the signed-in user, so each identity holds its own feed,
	// and a sign-in or sign-out never renders the last one's.
	// the fetch asks for every finding, read or not, since the view, sort, resource kind, and tag filters run client-side
	const queryClient = useQueryClient()
	const { data: topicFeed = null, refetch } = useQuery({
		queryKey: ["topic-feed", session?.user.id ?? null],
		// log a failed load, then rethrow so the query records the error
		queryFn: async () => {
			try {
				return await fetchTopicFeed(true)
			} catch (error) {
				console.error("feed load failed", error)
				throw error
			}
		},
	})

	// re-fetch the feed, reporting whether fresh data landed
	const reload = useCallback(async () => {
		return (await refetch()).isSuccess
	}, [refetch])

	// a reheat is a manual reload. the key bump remounts the feed sections so the hydrate animation replays
	const [reheatKey, setReheatKey] = useState(0)
	const [isReheating, setIsReheating] = useState(false)
	const reheat = useCallback(async () => {
		setIsReheating(true)
		try {
			// the key bump replays the entrance animation over new content, so a reload that failed leaves it alone
			// instead of animating the feed again
			if (await reload()) {
				setReheatKey((previousKey) => previousKey + 1)
			}
		} finally {
			setIsReheating(false)
		}
	}, [reload])

	// clear filters on route navigation
	const { pathname } = useLocation()
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname isn't read in the body, it's the reset trigger
	useEffect(() => {
		setView("all")
		setSort("relevant")
		setResourceKinds(new Set(allResourceKinds))
		setTagFilters([])
		setTagMatchMode("any")
	}, [pathname])

	// re-fetch the topic feed after a new finding is written, in place of each handler awaiting its own reload
	const invalidateTopicFeed = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: ["topic-feed"] })
	}, [queryClient])

	// mark a topic finding consumed or unread with the isConsumed flag
	const consumeTopicFindingMutation = useMutation({
		mutationFn: (input: { findingId: string; isConsumed: boolean }) =>
			sendTopicFindingConsumed(input.findingId, input.isConsumed),
		onSuccess: invalidateTopicFeed,
		onError: (error) => console.error("consume failed", error),
	})
	const consumeTopicFinding = useCallback<TopicFeedHandlers["consumeTopicFinding"]>(
		(findingId, isConsumed) => consumeTopicFindingMutation.mutate({ findingId, isConsumed }),
		[consumeTopicFindingMutation.mutate],
	)

	// opening a topic finding resource records a view event and also marks the topic finding consumed
	const openTopicFindingMutation = useMutation({
		mutationFn: (findingId: string) => sendTopicFindingOpened(findingId),
		onSuccess: invalidateTopicFeed,
		onError: (error) => console.error("view failed", error),
	})
	const openTopicFinding = useCallback<TopicFeedHandlers["openTopicFinding"]>(
		(findingId) => openTopicFindingMutation.mutate(findingId),
		[openTopicFindingMutation.mutate],
	)

	// set or clear a thumbs up or down topic finding rating
	const rateTopicFindingMutation = useMutation({
		mutationFn: (input: { findingId: string; rating: "up" | "down" | null }) =>
			sendTopicFindingRating(input.findingId, input.rating),
		onSuccess: invalidateTopicFeed,
		onError: (error) => console.error("rate failed", error),
	})
	const rateTopicFinding = useCallback<TopicFeedHandlers["rateTopicFinding"]>(
		(findingId, rating) => rateTopicFindingMutation.mutate({ findingId, rating }),
		[rateTopicFindingMutation.mutate],
	)

	// bookmark or unbookmark a topic finding, keeping it past the max-results filter
	const bookmarkTopicFindingMutation = useMutation({
		mutationFn: (input: { findingId: string; isBookmarked: boolean }) =>
			sendTopicFindingBookmark(input.findingId, input.isBookmarked),
		onSuccess: invalidateTopicFeed,
		onError: (error) => console.error("bookmark failed", error),
	})
	const bookmarkTopicFinding = useCallback<TopicFeedHandlers["bookmarkTopicFinding"]>(
		(findingId, isBookmarked) => bookmarkTopicFindingMutation.mutate({ findingId, isBookmarked }),
		[bookmarkTopicFindingMutation.mutate],
	)

	// toggle a resource kind in or out of the filtered set. reset to all resource kinds if empty
	const toggleResourceKind = useCallback((resourceKind: ResourceKind) => {
		setResourceKinds((currentResourceKinds) => {
			const nextResourceKinds = new Set(currentResourceKinds)
			// flip this resource kind, then guard against an empty selection
			if (nextResourceKinds.has(resourceKind)) {
				nextResourceKinds.delete(resourceKind)
			} else {
				nextResourceKinds.add(resourceKind)
			}
			return nextResourceKinds.size === 0 ? new Set(allResourceKinds) : nextResourceKinds
		})
	}, [])

	// every tag across the raw feed, deduped and sorted, so tag pickers and filters offer the full set
	const knownTags = useMemo(() => {
		const feedTopics = topicFeed?.sections.flatMap((section) => section.topics) ?? []
		return [...new Set(feedTopics.flatMap((feedTopic) => feedTopic.tags))].sort()
	}, [topicFeed])

	// bundle the handlers, then apply the filters and sort for the topic feed
	const handlers: TopicFeedHandlers = useMemo(
		() => ({ openTopicFinding, consumeTopicFinding, rateTopicFinding, bookmarkTopicFinding }),
		[openTopicFinding, consumeTopicFinding, rateTopicFinding, bookmarkTopicFinding],
	)
	const filteredTopicFeed = useMemo(
		() => filterTopicFeed(topicFeed, resourceKinds, view, sort, tagFilters, tagMatchMode),
		[topicFeed, resourceKinds, view, sort, tagFilters, tagMatchMode],
	)
	return {
		// the filtered feed and the view and sort state behind it
		topicFeed: filteredTopicFeed,
		view,
		setView,
		sort,
		setSort,
		resourceKinds,
		toggleResourceKind,
		// the tag filters, their match mode, and the tags the pickers can offer
		tagFilters,
		setTagFilters,
		tagMatchMode,
		setTagMatchMode,
		knownTags,
		reload,
		reheat,
		reheatKey,
		isReheating,
		handlers,
		// whether the viewer is signed in, so per-user finding controls hide for signed-out visitors
		isSignedIn,
	}
}

// filter and sort the topic feed
function filterTopicFeed(
	topicFeed: TopicFeedResponse | null,
	resourceKinds: Set<ResourceKind>,
	view: FeedView,
	sort: FindingSort,
	tagFilters: string[],
	tagMatchMode: TagMatchMode,
): TopicFeedResponse | null {
	if (!topicFeed) {
		return null
	}

	// rebuild the topic feed sections, dropping topics that miss the tag filters,
	// and replacing each topic's findings with the filtered and sorted set
	return {
		...topicFeed,
		sections: topicFeed.sections.map((section) => ({
			key: section.key,
			// keep the matching topics, replacing their findings with the filtered set
			topics: section.topics
				.filter((topic) => matchesTagFilters(topic.tags, tagFilters, tagMatchMode))
				.map((topic) => ({
					...topic,
					findings: toSortedFindings(
						topic.findings.filter(
							(finding) => resourceKinds.has(finding.resourceKind) && matchesFeedView(finding, view),
						),
						sort,
					),
				})),
		})),
	}
}

// whether a topic's tags satisfy the selected filters based on the tag match mode.
// "off" or an empty selection matches everything
function matchesTagFilters(topicTags: string[], tagFilters: string[], tagMatchMode: TagMatchMode): boolean {
	if (tagMatchMode === "off" || tagFilters.length === 0) {
		return true
	}

	// count the selected tags the topic carries, then judge per mode
	const matchedTagCount = tagFilters.filter((tag) => topicTags.includes(tag)).length
	if (tagMatchMode === "any") {
		return matchedTagCount > 0
	}
	if (tagMatchMode === "all") {
		return matchedTagCount === tagFilters.length
	}
	return matchedTagCount === 0
}
