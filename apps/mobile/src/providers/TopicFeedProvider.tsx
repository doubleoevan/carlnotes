import { type TopicFeedState, useTopicFeedState } from "@carlnotes/core/hooks/useTopicFeedState"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import * as Application from "expo-application"
import Constants from "expo-constants"
import * as Network from "expo-network"
import { usePathname } from "expo-router"
import * as Updates from "expo-updates"
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { activateQueryCache, createQueryCache } from "@/queryCache"
import { toQueryCacheBuster } from "@/queryCacheRules"
import { SearchBarProvider } from "./SearchBarProvider"

// only an authenticated tree owns a persisted feed
const TopicFeedContext = createContext<TopicFeedState | null>(null)

/**
 * Restores the account's reading cache before mounting its feed queries.
 */
export function TopicFeedProvider({
	userId,
	canBrowse = true,
	children,
}: {
	userId: string | null
	canBrowse?: boolean
	children: ReactNode
}) {
	useQueryPlatformSignals()
	if (!userId) {
		return <VisitorTopicFeedProvider canBrowse={canBrowse}>{children}</VisitorTopicFeedProvider>
	}
	return (
		<AccountTopicFeedProvider key={userId} userId={userId}>
			{children}
		</AccountTopicFeedProvider>
	)
}

/**
 * Returns the current account's or visitor's shared feed state.
 */
export function useTopicFeed(): TopicFeedState {
	const topicFeed = useContext(TopicFeedContext)
	if (!topicFeed) {
		throw new Error("useTopicFeed requires a TopicFeedProvider")
	}
	return topicFeed
}

// keep public reading in memory and discard it when the session changes
function VisitorTopicFeedProvider({ canBrowse, children }: { canBrowse: boolean; children: ReactNode }) {
	const [queryClient] = useState(() => new QueryClient())
	return (
		<QueryClientProvider client={queryClient}>
			<SearchBarProvider>
				{canBrowse ? <TopicFeedStateProvider userId={null}>{children}</TopicFeedStateProvider> : children}
			</SearchBarProvider>
		</QueryClientProvider>
	)
}

// own the query client for exactly one authenticated account lifetime
function AccountTopicFeedProvider({ userId, children }: { userId: string; children: ReactNode }) {
	// keep development's effect replay inside the same storage lifetime
	const mountGeneration = useRef(0)
	const [queryCache] = useState(() =>
		createQueryCache({
			userId,
			storage: AsyncStorage,
			buster: toQueryCacheBuster({
				appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "development",
				nativeBuildVersion: Application.nativeBuildVersion,
				runtimeVersion: Updates.runtimeVersion,
				updateId: Updates.updateId,
			}),
		}),
	)
	useEffect(() => {
		const generation = ++mountGeneration.current
		activateQueryCache(queryCache)
		return () => {
			queueMicrotask(() => {
				if (mountGeneration.current === generation) {
					void queryCache.clear()
				}
			})
		}
	}, [queryCache])
	return (
		<PersistQueryClientProvider client={queryCache.client} persistOptions={queryCache.persistOptions}>
			<SearchBarProvider>
				<TopicFeedStateProvider userId={userId}>{children}</TopicFeedStateProvider>
			</SearchBarProvider>
		</PersistQueryClientProvider>
	)
}

// reset shared selection when navigation changes the screen
function TopicFeedStateProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
	// subscribe to navigation outside the shared hook
	const pathname = usePathname()
	const topicFeed = useTopicFeedState({ userId, shouldUpdateOptimistically: true })
	const { resetFilters } = topicFeed
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the navigation reset trigger
	useEffect(() => {
		resetFilters()
	}, [pathname, resetFilters])
	return <TopicFeedContext.Provider value={topicFeed}>{children}</TopicFeedContext.Provider>
}

// connect Query to the platform's connection and foreground signals once
function useQueryPlatformSignals(): void {
	useEffect(() => {
		// seed connectivity and stop a late seed from overriding a newer event
		let hasNetworkEvent = false
		let isActive = true
		const network = Network.addNetworkStateListener((state) => {
			hasNetworkEvent = true
			onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false)
		})
		void Network.getNetworkStateAsync()
			.then((state) => {
				if (isActive && !hasNetworkEvent) {
					onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false)
				}
			})
			.catch((error) => console.error("network state read failed", error))

		// refresh stale reads on foreground activation
		focusManager.setFocused(AppState.currentState === "active")
		const focus = AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"))
		return () => {
			isActive = false
			network.remove()
			focus.remove()
		}
	}, [])
}
