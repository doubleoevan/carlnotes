import { ApiResponseError } from "@carlnotes/client/apiClient"
import type { TopicPageResult } from "@carlnotes/client/topicClient"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { type DehydratedState, type InfiniteData, QueryClient } from "@tanstack/react-query"
import type { Persister, PersistQueryClientOptions } from "@tanstack/react-query-persist-client"
import { shouldPersistQuery, toQueryCacheKey } from "./queryCacheRules"

// the storage contract is injected so lifecycle checks need no native modules
export type QueryCacheStorage = {
	getItem: (key: string) => Promise<string | null>
	setItem: (key: string, snapshot: string) => Promise<void>
	removeItem: (key: string) => Promise<void>
}
// the cache an account holds
export type QueryCache = {
	userId: string
	client: QueryClient
	persistOptions: Omit<PersistQueryClientOptions, "queryClient">
	clear: () => Promise<void>
	selectTopic: (topicId: string) => void
}
type CreateQueryCacheOptions = { userId: string; buster: string; storage: QueryCacheStorage }

// the persister options
type ToConfirmedPersisterOptions = {
	client: QueryClient
	storagePersister: Persister
	userId: string
	latestTopicId: () => string | null
	unavailableTopicIds: Set<string>
	failedSaveCount: () => number
}
// the lifetime and tracking options
type ToStorageLifetimeOptions = { storage: QueryCacheStorage; key: string; onSaveError: () => void }
type TrackLatestTopicOptions = { client: QueryClient; userId: string }

// the active account's lifetime, cleared by explicit session exit
let activeQueryCache: QueryCache | null = null

/**
 * Returns true if a failed query reads again: up to three times, and never for a response that did not match its
 * contract.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
	return !(error instanceof ApiResponseError) && failureCount < 3
}

/**
 * Returns a query client whose failed queries retry by shouldRetryQuery.
 */
export function toQueryClient(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } })
}

/**
 * Creates an isolated reading cache whose delayed writes stop at session exit.
 */
export function createQueryCache({ userId, buster, storage }: CreateQueryCacheOptions): QueryCache {
	// retain only the two reading families for the lifetime of the account
	const client = toQueryClient()
	client.setQueryDefaults(["topic-feed", userId], { gcTime: Number.POSITIVE_INFINITY })
	client.setQueryDefaults(["topic-page", userId], { gcTime: Number.POSITIVE_INFINITY })
	let failedSaveCount = 0
	const lifetime = toStorageLifetime({
		storage,
		key: toQueryCacheKey(userId),
		onSaveError: () => {
			failedSaveCount += 1
		},
	})
	const storagePersister = createAsyncStoragePersister({
		storage: lifetime.storage,
		key: toQueryCacheKey(userId),
		throttleTime: 0,
	})
	const topics = trackLatestTopic({ client, userId })
	const persister = toConfirmedPersister({
		client,
		storagePersister,
		userId,
		latestTopicId: topics.latestTopicId,
		unavailableTopicIds: topics.unavailableTopicIds,
		failedSaveCount: () => failedSaveCount,
	})

	// deactivate storage before cancelling reads or clearing live data
	let clearing: Promise<void> | undefined
	const clear = (): Promise<void> => {
		if (clearing) {
			return clearing
		}
		// stop the storage and the Topic tracking, then cancel the reads and clear the live data
		lifetime.deactivate()
		topics.stop()
		clearing = client.cancelQueries().then(async () => {
			client.clear()
			await lifetime.remove()
		})
		// every later caller gets the same clearing
		return clearing
	}
	return {
		userId,
		client,
		clear,
		selectTopic: topics.selectTopic,
		persistOptions: {
			persister,
			buster,
			maxAge: Number.POSITIVE_INFINITY,
			dehydrateOptions: {
				shouldDehydrateMutation: () => false,
				shouldDehydrateQuery: (query) => shouldPersistQuery({ query, userId, latestTopicId: topics.latestTopicId() }),
			},
		},
	}
}

/**
 * Registers the authenticated tree's current cache and clears a previous account's lifetime.
 */
export function activateQueryCache(queryCache: QueryCache): void {
	if (activeQueryCache && activeQueryCache !== queryCache) {
		void activeQueryCache.clear()
	}
	activeQueryCache = queryCache
}

/**
 * Clears the active account's saved and live reading data.
 */
export async function clearQueryCache(): Promise<void> {
	await toQueryCacheCleanup()()
}

/**
 * Selects the focused Topic for retention when its visible payload is available.
 */
export function selectCachedTopic(topicId: string): void {
	activeQueryCache?.selectTopic(topicId)
}

/**
 * Captures the current account's cleanup before an asynchronous sign-out request.
 */
export function toQueryCacheCleanup(): () => Promise<void> {
	const queryCache = activeQueryCache
	return async () => {
		// detach only the captured lifetime if another account has since signed in
		if (activeQueryCache === queryCache) {
			activeQueryCache = null
		}
		await queryCache?.clear()
	}
}

// preserve the last successful snapshot when a later read fails
function toConfirmedPersister({
	client,
	storagePersister,
	userId,
	latestTopicId,
	unavailableTopicIds,
	failedSaveCount,
}: ToConfirmedPersisterOptions): Persister {
	const confirmedQueries = new Map<string, DehydratedState["queries"][number]>()
	let savedQueries: DehydratedState["queries"] | undefined
	let savedBuster: string | undefined
	let savedFailureCount = 0
	return {
		persistClient: (persistedClient) => {
			// update only from successful dehydrated data, including acknowledged writes
			for (const query of persistedClient.clientState.queries) {
				confirmedQueries.set(query.queryHash, query)
			}
			// the queries to save: the confirmed snapshot of each live query the rules keep
			const queries = client
				.getQueryCache()
				.getAll()
				.flatMap((query) => {
					let confirmedQuery = confirmedQueries.get(query.queryHash)
					if (!confirmedQuery) {
						return []
					}
					// revoke access in the last confirmed snapshot even while an earlier read is cancelling
					if (query.queryKey[0] === "topic-feed") {
						const data = toAvailableTopics(confirmedQuery.state.data as TopicFeedResponse, unavailableTopicIds)
						if (data !== confirmedQuery.state.data) {
							confirmedQuery = { ...confirmedQuery, state: { ...confirmedQuery.state, data } }
							confirmedQueries.set(query.queryHash, confirmedQuery)
						}
					}
					// keep the confirmed snapshot of a query whose last read failed
					const isRetainedError =
						query.state.status === "error" &&
						shouldPersistQuery({
							query: { queryKey: query.queryKey, state: confirmedQuery.state },
							userId,
							latestTopicId: latestTopicId(),
						})
					return isRetainedError || shouldPersistQuery({ query, userId, latestTopicId: latestTopicId() })
						? [confirmedQuery]
						: []
				})
			// release snapshots for evicted pages and revoked access
			const retainedHashes = new Set(queries.map((query) => query.queryHash))
			for (const hash of confirmedQueries.keys()) {
				if (!retainedHashes.has(hash)) {
					confirmedQueries.delete(hash)
				}
			}
			// transient queries must not rewrite an unchanged reading snapshot
			if (
				savedFailureCount === failedSaveCount() &&
				savedBuster === persistedClient.buster &&
				savedQueries?.length === queries.length &&
				queries.every((query, index) => {
					// the same query with the same data from the same time
					const saved = savedQueries?.[index]
					return (
						saved?.queryHash === query.queryHash &&
						saved.state.data === query.state.data &&
						saved.state.dataUpdatedAt === query.state.dataUpdatedAt
					)
				})
			) {
				// an unchanged snapshot is not written
				return
			}
			// remember what is saved, then write it
			savedQueries = queries
			savedBuster = persistedClient.buster
			savedFailureCount = failedSaveCount()
			return storagePersister.persistClient({ ...persistedClient, clientState: { mutations: [], queries } })
		},
		restoreClient: async () => {
			// restored successes are also the fallback for a failed first refresh
			try {
				const persistedClient = await storagePersister.restoreClient()
				// the restored queries are the confirmed ones
				for (const query of persistedClient?.clientState.queries ?? []) {
					confirmedQueries.set(query.queryHash, query)
				}
				return persistedClient
			} catch {
				await storagePersister.removeClient()
				return undefined
			}
		},
		removeClient: () => {
			savedQueries = undefined
			return storagePersister.removeClient()
		},
	}
}

// serialize storage operations and reject writes from an ended lifetime
function toStorageLifetime({ storage, key, onSaveError }: ToStorageLifetimeOptions): {
	storage: QueryCacheStorage
	deactivate: () => void
	remove: () => Promise<void>
} {
	// the queue includes only accepted writes
	let isActive = true
	let pendingStorage: Promise<void> = Promise.resolve()
	const guardedStorage: QueryCacheStorage = {
		// a read after the lifetime ended returns nothing, and a read that failed logs and returns nothing
		getItem: async (storageKey) => {
			try {
				const snapshot = await storage.getItem(storageKey)
				return isActive ? snapshot : null
			} catch (error) {
				console.error("feed cache restore failed", error)
				return null
			}
		},
		setItem: (storageKey, snapshot) => {
			if (!isActive) {
				return Promise.resolve()
			}
			// queue the write behind the pending ones, and count one that failed
			pendingStorage = pendingStorage
				.then(() => (isActive ? storage.setItem(storageKey, snapshot) : undefined))
				.catch((error) => {
					onSaveError()
					console.error("feed cache save failed", error)
				})
			return pendingStorage
		},
		removeItem: (storageKey) =>
			storage.removeItem(storageKey).catch((error) => console.error("feed cache removal failed", error)),
	}
	return {
		storage: guardedStorage,
		deactivate: () => {
			isActive = false
		},
		remove: async () => {
			await pendingStorage
			await guardedStorage.removeItem(key)
		},
	}
}

// retain one visible topic and evict older inactive pages
function trackLatestTopic({ client, userId }: TrackLatestTopicOptions): {
	latestTopicId: () => string | null
	selectTopic: (topicId: string) => void
	stop: () => void
	unavailableTopicIds: Set<string>
} {
	// restored queries and newly successful reads both select the current page
	const unavailableTopicIds = new Set<string>()
	let latestTopicId: string | null = null
	let focusedTopicId: string | null = null
	const selectTopic = (topicId: string): void => {
		// remember focus before an in-flight page read finishes
		focusedTopicId = topicId
		const page = client.getQueryData<TopicPageResult>(["topic-page", userId, topicId])
		if (page?.status === "visible") {
			latestTopicId = topicId
		}
	}
	// follow each Topic page read: a denied one is removed everywhere, and a visible one becomes the kept page
	const stop = client.getQueryCache().subscribe((event) => {
		const query = event.query
		const [family, queryUserId, topicId] = query.queryKey
		// only a loaded Topic page of this account
		if (
			family !== "topic-page" ||
			queryUserId !== userId ||
			typeof topicId !== "string" ||
			query.state.status !== "success"
		) {
			return
		}
		// only a new page or a finished read
		if (event.type !== "added" && !(event.type === "updated" && event.action.type === "success")) {
			return
		}
		// a denied Topic leaves the kept page and every cached list
		if ((query.state.data as TopicPageResult)?.status !== "visible") {
			if (latestTopicId === topicId) {
				latestTopicId = null
			}
			unavailableTopicIds.add(topicId)
			void removeUnavailableTopic({ client, userId, topicId })
			return
		}
		// a visible page is kept only if it is the focused one, and the other inactive pages go
		unavailableTopicIds.delete(topicId)
		if (focusedTopicId !== null && focusedTopicId !== topicId) {
			return
		}
		latestTopicId = topicId
		client.removeQueries({
			queryKey: ["topic-page", userId],
			type: "inactive",
			predicate: (otherQuery) => otherQuery.queryKey[2] !== topicId,
		})
	})
	return { latestTopicId: () => latestTopicId, selectTopic, stop, unavailableTopicIds }
}

// retire every cached occurrence after the server explicitly denies this Topic
async function removeUnavailableTopic({
	client,
	userId,
	topicId,
}: TrackLatestTopicOptions & { topicId: string }): Promise<void> {
	// cancel earlier reads before they can restore content from before the denial
	await client.cancelQueries(
		{
			predicate: (query) =>
				query.queryKey[1] === userId && ["topic-feed", "site-search"].includes(String(query.queryKey[0])),
		},
		{ revert: false },
	)
	client.setQueryData<TopicFeedResponse>(["topic-feed", userId], (feed) =>
		feed ? toAvailableTopics(feed, new Set([topicId])) : feed,
	)
	client.setQueriesData<InfiniteData<SearchResultsPage>>(
		{ queryKey: ["site-search", userId] },
		(search) =>
			search && {
				...search,
				pages: search.pages.map((page) => ({
					...page,
					rows: page.rows.filter((row) => !("topic" in row) || row.topic.id !== topicId),
				})),
			},
	)
}

// keep the same snapshot when it contains no denied Topic
function toAvailableTopics(feed: TopicFeedResponse, unavailableTopicIds: Set<string>): TopicFeedResponse {
	if (!feed.sections.some((section) => section.topics.some((topic) => unavailableTopicIds.has(topic.id)))) {
		return feed
	}
	return {
		...feed,
		sections: feed.sections.map((section) => ({
			...section,
			topics: section.topics.filter((topic) => !unavailableTopicIds.has(topic.id)),
		})),
	}
}
