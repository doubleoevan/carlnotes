import type { TopicFeedResponse } from "@shared/contracts"
import { resourceKinds as allResourceKinds } from "@shared/enums"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import {
	fetchTopicFeed,
	sendTopicFindingBookmark,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
} from "@/clients/topicClient"
import { matchesTopicFindingFilter, type TopicFindingFilter } from "@/lib/topicFindingFilters"
import { type TopicFindingSort, toSortedTopicFindings } from "@/lib/topicFindingSorts"

// the resource kinds that the Filters menu toggles
export type ResourceKind = (typeof allResourceKinds)[number]

// how selected tag filters match a topic. it has any of them, all of them, none of them, or off to ignore tag filtering
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

// returns the shared topic feed context value. throws an error if used outside of the provider
export function useTopicFeed(): TopicFeedValue {
	const contextValue = useContext(TopicFeedContext)
	if (!contextValue) {
		throw new Error("useTopicFeed must be used inside a <TopicFeedProvider>")
	}
	return contextValue
}

// returns the topic feed handlers. throws an error if used outside the provider
export function useTopicFeedActions(): TopicFeedHandlers {
	return useTopicFeed().handlers
}

// whether anyone is signed in, used to hide the per-user finding buttons from a visitor
export function useIsSignedIn(): boolean {
	return useTopicFeed().isSignedIn
}

// the topic feed state the provider owns
function useTopicFeedState() {
	// like Gmail, shows everything by default with consumed rows muted. Unread narrows to unconsumed, Bookmarked to bookmarks
	const [findingFilter, setFindingFilter] = useState<TopicFindingFilter>("all")
	// how findings order within the pinned and unbookmarked groups. read-side only, never persisted
	const [sort, setSort] = useState<TopicFindingSort>("relevant")
	const [resourceKinds, setResourceKinds] = useState<Set<ResourceKind>>(new Set(allResourceKinds))
	// whose bookmarks the bookmarked filter shows: the reader's own, or every member's on a team topic
	const [bookmarkScope, setBookmarkScope] = useState<"mine" | "team">("mine")
	// the feed watches the session itself
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// selected tag filters and how they match. a topic has any, all, or none of them
	const [tagFilters, setTagFilters] = useState<string[]>([])
	const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("any")

	// tanstack caches the topic feed keyed by the signed-in user
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

	// re-fetch the feed, reporting whether fresh data arrived
	const reload = useCallback(async () => {
		return (await refetch()).isSuccess
	}, [refetch])

	// a reheat is a manual reload. the key bump remounts the feed sections so the hydrate animation replays
	const [reheatKey, setReheatKey] = useState(0)
	const [isReheating, setIsReheating] = useState(false)
	const reheat = useCallback(async () => {
		setIsReheating(true)
		try {
			// the key only bumps on a reload that arrived
			if (await reload()) {
				setReheatKey((previousKey) => previousKey + 1)
			}
		} finally {
			setIsReheating(false)
		}
	}, [reload])

	// clear filters on route navigation, so a page that offers none of them never leaves one applied
	const { pathname } = useLocation()
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname isn't read in the body, it's the reset trigger
	useEffect(() => {
		setFindingFilter("all")
		setSort("relevant")
		setResourceKinds(new Set(allResourceKinds))
		setTagFilters([])
		setTagMatchMode("any")
		setBookmarkScope("mine")
	}, [pathname])

	// the home feed and a topic's page are where findings render
	const hasTopicFeed = pathname === "/" || pathname.startsWith("/topics/")

	// re-fetch the topic feed after a new finding is written, in place of each handler waiting for its own reload
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
		() => filterTopicFeed(topicFeed, resourceKinds, findingFilter, sort, tagFilters, tagMatchMode),
		[topicFeed, resourceKinds, findingFilter, sort, tagFilters, tagMatchMode],
	)
	return {
		// the filtered feed and the finding filter and sort state behind it
		topicFeed: filteredTopicFeed,
		findingFilter,
		setFindingFilter,
		sort,
		setSort,
		resourceKinds,
		toggleResourceKind,
		// the tag filters, their match mode, and the tags the pickers can offer
		tagFilters,
		setTagFilters,
		tagMatchMode,
		setTagMatchMode,
		bookmarkScope,
		setBookmarkScope,
		knownTags,
		reload,
		reheat,
		reheatKey,
		isReheating,
		handlers,
		// whether anyone is signed in, so the per-user finding buttons hide for a visitor
		isSignedIn,
		// whether this page renders findings, which is what the kind, view, tag, and sort controls narrow
		hasTopicFeed,
	}
}

// filter and sort the topic feed
function filterTopicFeed(
	topicFeed: TopicFeedResponse | null,
	resourceKinds: Set<ResourceKind>,
	findingFilter: TopicFindingFilter,
	sort: TopicFindingSort,
	tagFilters: string[],
	tagMatchMode: TagMatchMode,
): TopicFeedResponse | null {
	if (!topicFeed) {
		return null
	}

	// rebuild the topic feed sections, dropping topics that miss the tag filters
	return {
		...topicFeed,
		sections: topicFeed.sections.map((section) => ({
			key: section.key,
			topics: section.topics
				.filter((topic) => matchesTagFilters(topic.tags, tagFilters, tagMatchMode))
				.map((topic) => ({
					...topic,
					findings: toSortedTopicFindings(
						topic.findings.filter(
							(finding) => resourceKinds.has(finding.resourceKind) && matchesTopicFindingFilter(finding, findingFilter),
						),
						sort,
					),
				})),
		})),
	}
}

// whether a topic's tags satisfy the selected filters based on the tag match mode
function matchesTagFilters(topicTags: string[], tagFilters: string[], tagMatchMode: TagMatchMode): boolean {
	if (tagMatchMode === "off" || tagFilters.length === 0) {
		return true
	}

	// count the selected tags the topic has, then judge per mode
	const matchedTagCount = tagFilters.filter((tag) => topicTags.includes(tag)).length
	if (tagMatchMode === "any") {
		return matchedTagCount > 0
	}
	if (tagMatchMode === "all") {
		return matchedTagCount === tagFilters.length
	}
	return matchedTagCount === 0
}
