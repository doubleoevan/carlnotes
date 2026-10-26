import type { TopicPageResult } from "@carlnotes/client/topicClient"
import type { Query } from "@tanstack/react-query"

type ShouldPersistQueryOptions = {
	query: Pick<Query, "queryKey" | "state">
	userId: string
	latestTopicId: string | null
}

// the application identities that invalidate saved reading data
export type QueryCacheBuild = {
	appVersion: string
	nativeBuildVersion: string | null
	runtimeVersion: string | null
	updateId: string | null
}

/**
 * Names one account's saved feed.
 */
export function toQueryCacheKey(userId: string): string {
	return `carlnotes:feed:${userId}`
}

/**
 * Invalidates saved data after a schema, binary, or delivered update changes.
 */
export function toQueryCacheBuster(build: QueryCacheBuild): string {
	return JSON.stringify([
		1,
		build.appVersion,
		build.nativeBuildVersion,
		build.runtimeVersion,
		build.updateId ?? "embedded",
	])
}

/**
 * Selects the account's confirmed feed and most recently loaded visible topic.
 */
export function shouldPersistQuery({ query, userId, latestTopicId }: ShouldPersistQueryOptions): boolean {
	// exclude failed and unconfirmed reads, and every other account
	const [family, queryUserId, topicId] = query.queryKey
	if (queryUserId !== userId || query.state.status !== "success") {
		return false
	}
	if (family === "topic-feed" && query.queryKey.length === 2) {
		return true
	}
	if (family !== "topic-page" || query.queryKey.length !== 3 || topicId !== latestTopicId) {
		return false
	}
	return (query.state.data as TopicPageResult | undefined)?.status === "visible"
}
