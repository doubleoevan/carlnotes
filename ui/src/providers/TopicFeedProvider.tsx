import type { TopicFeedResponse } from "@shared/contracts"
import { resourceKinds as allResourceKinds } from "@shared/enums"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { authClient } from "@/lib/authClient"
import {
	fetchTopicFeed,
	sendTopicFindingConsumed,
	sendTopicFindingOpened,
	sendTopicFindingRating,
} from "@/lib/topicFeedClient"

// the resource kinds that the Filters menu toggles
export type ResourceKind = (typeof allResourceKinds)[number]

// the actions a topic feed resource can trigger. bundled so that components can share these handlers
export type TopicFeedHandlers = {
	open: (findingId: string) => void
	consume: (findingId: string, isConsumed: boolean) => void
	rate: (findingId: string, value: "up" | "down" | null) => void
}

// shape of the topic feed context derived from the hook's return type
type TopicFeedValue = ReturnType<typeof useTopicFeedState>
// the topic feed context shares one state instance via a single top-level provider, null unless set
const TopicFeedContext = createContext<TopicFeedValue | null>(null)

// owns the single topic feed instance and shares it with all descendant components
export function TopicFeedProvider({ children }: { children: ReactNode }) {
	return <TopicFeedContext.Provider value={useTopicFeedState()}>{children}</TopicFeedContext.Provider>
}

// returns the shared topic feed context value. throws if used outside the provider
export function useTopicFeed(): TopicFeedValue {
	const value = useContext(TopicFeedContext)
	if (!value) {
		throw new Error("useTopicFeed must be used inside a <TopicFeedProvider>")
	}
	return value
}

// returns the topic feed handlers. throws if used outside the provider
export function useTopicFeedActions(): TopicFeedHandlers {
	return useTopicFeed().handlers
}

// the topic feed state the provider owns: data, the "All" "Unread" toggle, the resource kind filters, and the topic finding handlers
function useTopicFeedState() {
	const [topicFeed, setTopicFeed] = useState<TopicFeedResponse | null>(null)
	// like Gmail, shows everything by default with consumed topic finding resources muted. the toggle narrows to unread
	const [showAll, setShowAll] = useState(true)
	const [resourceKinds, setResourceKinds] = useState<Set<ResourceKind>>(new Set(allResourceKinds))
	// the feed watches the session itself — no route guard unmounts it, so "yours" would otherwise go stale on sign-out
	const { data: session } = authClient.useSession()
	const isSignedIn = Boolean(session)

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
		async (findingId: string, value: "up" | "down" | null) => {
			try {
				await sendTopicFindingRating(findingId, value)
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
			const next = new Set(currentResourceKinds)
			// flip this resource kind, then guard against an empty selection
			if (next.has(resourceKind)) {
				next.delete(resourceKind)
			} else {
				next.add(resourceKind)
			}
			return next.size === 0 ? new Set(allResourceKinds) : next
		})
	}, [])

	// bundle the handlers, then apply the resource kind filter and the "All" or "Unread" view of the topic feed
	const handlers: TopicFeedHandlers = useMemo(() => ({ open, consume, rate }), [open, consume, rate])
	const filteredTopicFeed = useMemo(
		() => filterTopicFeed(topicFeed, resourceKinds, showAll),
		[topicFeed, resourceKinds, showAll],
	)
	return { topicFeed: filteredTopicFeed, showAll, setShowAll, resourceKinds, toggleResourceKind, reload, handlers }
}

// filter topic findings by selected resource kinds
// the "Unread" filter also drops consumed topic findings
function filterTopicFeed(
	topicFeed: TopicFeedResponse | null,
	resourceKinds: Set<ResourceKind>,
	showAll: boolean,
): TopicFeedResponse | null {
	if (!topicFeed) {
		return null
	}

	// rebuild the topic feed sections, filtering each topic's findings by resource kind and, in the "Unread" view, by not isConsumed
	return {
		sections: topicFeed.sections.map((section) => ({
			key: section.key,
			// keep the topic, replacing its findings with the filtered set
			topics: section.topics.map((topic) => ({
				...topic,
				findings: topic.findings.filter(
					(finding) => resourceKinds.has(finding.resourceKind) && (showAll || !finding.isConsumed),
				),
			})),
		})),
	}
}
