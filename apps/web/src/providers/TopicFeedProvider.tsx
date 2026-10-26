import { authClient } from "@carlnotes/client/authClient"
import { type TopicFeedState, useTopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import type { TopicFeedHandlers } from "@carlnotes/core/hooks/useTopicFindingActions"
import { useLocation, useMatch } from "@tanstack/react-router"
import { createContext, type ReactNode, useContext, useEffect } from "react"

export type { TopicFeedHandlers } from "@carlnotes/core/hooks/useTopicFindingActions"
export { usePageTopicFeedHandlers } from "@carlnotes/core/hooks/useTopicFindingActions"
// preserve the provider's public contracts for its web consumers
export type { ResourceKind } from "@carlnotes/core/lib/topicFeed"

// the web adds only the current route's feed availability
type TopicFeedValue = TopicFeedState & { hasTopicFeed: boolean }
const TopicFeedContext = createContext<TopicFeedValue | null>(null)

/**
 * Owns the single topic feed instance and shares it with every descendant component.
 */
export function TopicFeedProvider({ children }: { children: ReactNode }) {
	return <TopicFeedContext.Provider value={useWebTopicFeedState()}>{children}</TopicFeedContext.Provider>
}

/**
 * Returns the shared topic feed context value, and throws if used outside the provider.
 */
export function useTopicFeed(): TopicFeedValue {
	const contextValue = useContext(TopicFeedContext)
	if (!contextValue) {
		throw new Error("useTopicFeed must be used inside a <TopicFeedProvider>")
	}
	return contextValue
}

/**
 * Returns the shared topic feed context value, or null outside the provider, such as in an mcp card.
 */
export function useOptionalTopicFeed(): TopicFeedValue | null {
	return useContext(TopicFeedContext)
}

/**
 * Returns the topic feed handlers, or null outside the provider, where a component takes its handlers as props.
 */
export function useTopicFeedActions(): TopicFeedHandlers | null {
	return useContext(TopicFeedContext)?.handlers ?? null
}

/**
 * Returns whether anyone is signed in, inside the provider or out of it.
 */
export function useIsSignedIn(): boolean {
	const { data: session } = authClient().useSession()
	return Boolean(session)
}

// supply session, loader hydration, and navigation to the universal hook
function useWebTopicFeedState(): TopicFeedValue {
	// read the web-only inputs
	const { data: session } = authClient().useSession()
	const loadedTopicFeed = useMatch({ from: "/_layout/", shouldThrow: false })?.loaderData
	const { pathname } = useLocation()
	const topicFeedState = useTopicFeedState({
		userId: session?.user.id ?? null,
		visitorInitialData: loadedTopicFeed ?? undefined,
	})
	const { resetFilters } = topicFeedState

	// clear filters when the pathname changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the navigation reset trigger
	useEffect(() => {
		resetFilters()
	}, [pathname, resetFilters])
	return { ...topicFeedState, hasTopicFeed: pathname === "/" || pathname.startsWith("/topics/") }
}
