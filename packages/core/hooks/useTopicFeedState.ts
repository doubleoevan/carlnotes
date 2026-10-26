import { fetchTopicFeed } from "@carlnotes/client/topicClient"
import { resourceKinds as allResourceKinds } from "@carlnotes/contracts/enums"
import type { TagMatchMode, TopicFindingFilter, TopicFindingSort } from "@carlnotes/contracts/findings"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { onlineManager, useQuery } from "@tanstack/react-query"
import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react"
import { filterTopicFeed, type ResourceKind, toggleTopicResourceKind } from "../lib/topicFeed"
import { applyTopicFeedChanges, type TopicFindingChange } from "../lib/topicFindingChanges"
import { type TopicFeedHandlers, useTopicFindingActions } from "./useTopicFindingActions"

// the app supplies identity and optional visitor hydration
export type UseTopicFeedStateOptions = {
	userId: string | null
	visitorInitialData?: TopicFeedResponse
	shouldUpdateOptimistically?: boolean
}
export type TopicFeedFilters = {
	findingFilter: TopicFindingFilter
	setFindingFilter: Dispatch<SetStateAction<TopicFindingFilter>>
	sort: TopicFindingSort
	setSort: Dispatch<SetStateAction<TopicFindingSort>>
	resourceKinds: Set<ResourceKind>
	toggleResourceKind: (resourceKind: ResourceKind) => void
	bookmarkScope: "mine" | "team"
	setBookmarkScope: Dispatch<SetStateAction<"mine" | "team">>
	tagFilters: string[]
	setTagFilters: Dispatch<SetStateAction<string[]>>
	tagMatchMode: TagMatchMode
	setTagMatchMode: Dispatch<SetStateAction<TagMatchMode>>
	resetFilters: () => void
}
export type TopicFeedState = TopicFeedFilters & {
	topicFeed: TopicFeedResponse | null
	knownTags: string[]
	isLoading: boolean
	isError: boolean
	isFetching: boolean
	error: Error | null
	reloadTopicFeed: () => Promise<boolean>
	reheat: (reloadAdditionalPage?: () => Promise<boolean>) => Promise<void>
	reheatKey: number
	isReheating: boolean
	handlers: TopicFeedHandlers
	pendingChanges: TopicFindingChange[]
}

/**
 * Owns the universal feed query, selection, refresh, and finding actions.
 */
export function useTopicFeedState({
	userId,
	visitorInitialData,
	shouldUpdateOptimistically = false,
}: UseTopicFeedStateOptions): TopicFeedState {
	// seed only the visitor's identity, keeping its first browser render fresh
	const initialData = userId === null ? visitorInitialData : undefined
	const query = useQuery({
		queryKey: ["topic-feed", userId],
		initialData,
		staleTime: initialData ? 60_000 : 0,
		queryFn: loadTopicFeed,
	})
	const filters = useTopicFeedFilters()
	const actions = useTopicFindingActions({ userId, shouldUpdateOptimistically })
	const refresh = useTopicFeedRefresh(query.refetch)

	// apply tentative changes before selecting or ordering findings
	const presentedTopicFeed = useMemo(
		() => applyTopicFeedChanges(query.data ?? null, actions.pendingChanges),
		[query.data, actions.pendingChanges],
	)
	const topicFeed = useMemo(
		() => filterTopicFeed({ ...filters, topicFeed: presentedTopicFeed, bookmarkScope: "mine" }),
		[presentedTopicFeed, filters],
	)
	const knownTags = useMemo(() => {
		const topics = query.data?.sections.flatMap((section) => section.topics) ?? []
		return [...new Set(topics.flatMap((topic) => topic.tags))].sort()
	}, [query.data])
	return {
		...filters,
		...actions,
		...refresh,
		topicFeed,
		knownTags,
		isLoading: query.isPending,
		isFetching: query.isFetching,
		isError: query.isError,
		error: query.error,
	}
}

/**
 * Keeps feed selection independent of queries and platform navigation.
 */
export function useTopicFeedFilters(): TopicFeedFilters {
	// the defaults shared by the home feed and topic screens
	const [findingFilter, setFindingFilter] = useState<TopicFindingFilter>("all")
	const [sort, setSort] = useState<TopicFindingSort>("relevant")
	const [resourceKinds, setResourceKinds] = useState(() => new Set<ResourceKind>(allResourceKinds))
	const [bookmarkScope, setBookmarkScope] = useState<"mine" | "team">("mine")
	const [tagFilters, setTagFilters] = useState<string[]>([])
	const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>("any")

	// reset the controls when the app reports navigation
	const resetFilters = useCallback((): void => {
		setFindingFilter("all")
		setSort("relevant")
		setResourceKinds(new Set(allResourceKinds))
		setBookmarkScope("mine")
		setTagFilters([])
		setTagMatchMode("any")
	}, [])
	const toggleResourceKind = useCallback((resourceKind: ResourceKind): void => {
		setResourceKinds((currentResourceKinds) =>
			toggleTopicResourceKind({ resourceKinds: currentResourceKinds, resourceKind }),
		)
	}, [])
	return useMemo(
		() => ({
			findingFilter,
			setFindingFilter,
			sort,
			setSort,
			resourceKinds,
			toggleResourceKind,
			bookmarkScope,
			setBookmarkScope,
			tagFilters,
			setTagFilters,
			tagMatchMode,
			setTagMatchMode,
			resetFilters,
		}),
		[findingFilter, sort, resourceKinds, toggleResourceKind, bookmarkScope, tagFilters, tagMatchMode, resetFilters],
	)
}

// log a failed read before Query records its error
async function loadTopicFeed(): Promise<TopicFeedResponse> {
	try {
		return await fetchTopicFeed(true)
	} catch (error) {
		console.error("feed load failed", error)
		throw error
	}
}

// advance the refresh generation only when every requested read succeeds
function useTopicFeedRefresh(
	refetch: () => Promise<{ isSuccess: boolean }>,
): Pick<TopicFeedState, "reloadTopicFeed" | "reheat" | "reheatKey" | "isReheating"> {
	// report offline immediately instead of awaiting a paused query
	const [reheatKey, setReheatKey] = useState(0)
	const [isReheating, setIsReheating] = useState(false)
	const reloadTopicFeed = useCallback(
		async (): Promise<boolean> => onlineManager.isOnline() && (await refetch()).isSuccess,
		[refetch],
	)
	const reheat = useCallback(
		async (reloadAdditionalPage?: () => Promise<boolean>): Promise<void> => {
			if (!onlineManager.isOnline()) {
				return
			}
			setIsReheating(true)
			try {
				const refreshResults = await Promise.all([reloadTopicFeed(), reloadAdditionalPage?.() ?? true])
				if (refreshResults.every(Boolean)) {
					setReheatKey((previousKey) => previousKey + 1)
				}
			} catch (error) {
				console.error("feed refresh failed", error)
			} finally {
				setIsReheating(false)
			}
		},
		[reloadTopicFeed],
	)
	return { reheatKey, isReheating, reheat, reloadTopicFeed }
}
