import type { TopicFeedResponse } from "@shared/contracts"
import { resourceKinds as allResourceKinds } from "@shared/enums"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { authClient } from "@/lib/authClient"
import {
	fetchTopicFeed,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
} from "@/lib/topicClient"

// the resource kinds that the Filters menu toggles
export type ResourceKind = (typeof allResourceKinds)[number]

// how selected tag filters match a topic: carrying any of them, all of them, none of them, or off to ignore tag filtering
export const tagMatchModes = ["any", "all", "none", "off"] as const
export type TagMatchMode = (typeof tagMatchModes)[number]

// the actions a topic feed resource can trigger. bundled so that components can share these handlers
export type TopicFeedHandlers = {
	open: (findingId: string) => void
	consume: (findingId: string, isConsumed: boolean) => void
	rate: (findingId: string, rating: "up" | "down" | null) => void
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

// the topic feed state the provider owns: data, the "All" "Unread" toggle, the resource kind filters, the tag filters, and the topic finding handlers
function useTopicFeedState() {
	const [topicFeed, setTopicFeed] = useState<TopicFeedResponse | null>(null)
	// like Gmail, shows everything by default with consumed topic finding resources muted. the toggle narrows to unread
	const [showAll, setShowAll] = useState(true)
	const [resourceKinds, setResourceKinds] = useState<Set<ResourceKind>>(new Set(allResourceKinds))
	// the feed watches the session itself — no route guard unmounts it, so "yours" would otherwise go stale on sign-out
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)
	// selected tag filters and how they match: topics carrying any, all, or none of them
	const [tagFilters, setTagFilters] = useState<string[]>([])
	const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("any")

	// always fetch everything. the "All" "Unread" toggle and resource kind filters are applied client-side
	const reload = useCallback(async () => {
		try {
			const loadedTopicFeed = await fetchTopicFeed(true)
			setTopicFeed(loadedTopicFeed)
		} catch (error) {
			console.error("feed load failed", error)
		}
	}, [])

	// load the topic feed on mount, and again whenever sign-in state flips
	// biome-ignore lint/correctness/useExhaustiveDependencies: isSignedIn isn't read in the body, it's a deliberate re-fetch trigger
	useEffect(() => {
		void reload()
	}, [reload, isSignedIn])

	// mark a topic finding consumed or unread with the isConsumed flag
	const consume = useCallback(
		async (findingId: string, isConsumed: boolean) => {
			try {
				await sendTopicFindingConsumed(findingId, isConsumed)
				await reload()
			} catch (error) {
				console.error("consume failed", error)
			}
		},
		[reload],
	)

	// opening a topic finding resource records a view event and also marks the topic finding consumed
	const open = useCallback(
		async (findingId: string) => {
			try {
				await sendTopicFindingOpened(findingId)
				await reload()
			} catch (error) {
				console.error("view failed", error)
			}
		},
		[reload],
	)

	// set or clear a thumbs up or down rating
	const rate = useCallback(
		async (findingId: string, rating: "up" | "down" | null) => {
			try {
				await sendTopicFindingRating(findingId, rating)
				await reload()
			} catch (error) {
				console.error("rate failed", error)
			}
		},
		[reload],
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

	// bundle the handlers, then apply the tag, resource kind, and "All" or "Unread" views of the topic feed
	const handlers: TopicFeedHandlers = useMemo(() => ({ open, consume, rate }), [open, consume, rate])
	const filteredTopicFeed = useMemo(
		() => filterTopicFeed(topicFeed, resourceKinds, showAll, tagFilters, tagMatchMode),
		[topicFeed, resourceKinds, showAll, tagFilters, tagMatchMode],
	)
	return {
		// the filtered feed and the view state behind it
		topicFeed: filteredTopicFeed,
		showAll,
		setShowAll,
		resourceKinds,
		toggleResourceKind,
		// the tag filters, their match mode, and the tags the pickers can offer
		tagFilters,
		setTagFilters,
		tagMatchMode,
		setTagMatchMode,
		knownTags,
		reload,
		handlers,
		// whether the viewer is signed in, so per-user finding controls hide for signed-out visitors
		isSignedIn,
	}
}

// filter topics by selected tags, and topic findings by selected resource kinds
// the "Unread" filter also drops consumed topic findings
function filterTopicFeed(
	topicFeed: TopicFeedResponse | null,
	resourceKinds: Set<ResourceKind>,
	showAll: boolean,
	tagFilters: string[],
	tagMatchMode: TagMatchMode,
): TopicFeedResponse | null {
	if (!topicFeed) {
		return null
	}

	// rebuild the topic feed sections, dropping topics that miss the tag filters,
	// then filtering each topic's findings by resource kind and, in the "Unread" view, by not isConsumed
	return {
		...topicFeed,
		sections: topicFeed.sections.map((section) => ({
			key: section.key,
			// keep the matching topics, replacing their findings with the filtered set
			topics: section.topics
				.filter((topic) => matchesTagFilters(topic.tags, tagFilters, tagMatchMode))
				.map((topic) => ({
					...topic,
					findings: topic.findings.filter(
						(finding) => resourceKinds.has(finding.resourceKind) && (showAll || !finding.isConsumed),
					),
				})),
		})),
	}
}

// whether a topic's tags satisfy the selected filters based on the tag match mode. off and an empty selection match everything
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
