// the search bar's topic name search, which applies the topic view rules in SQL
import { SEARCH_MIN_CHARS, type TopicSearchResult, USER_SEARCH_LIMIT } from "@shared/contracts/search"
import { and, like, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { loadUserAccess } from "../../db/quotas"
import { topics } from "../../db/schema/topics"
import { type AppEnv, currentUser } from "../currentUser"
import { toContainsLikePattern } from "../likePattern"
import { searchRateLimiter } from "../rateLimit"
import { toTopicViewFilter } from "./permissions"

// who is searching, and the typed query
export type SearchTopicsOptions = { userId: string | null; query: string }

/**
 * Returns the listed topics whose name contains the query and that the user may open, shortest name first.
 */
export async function searchTopics({ userId, query }: SearchTopicsOptions): Promise<TopicSearchResult[]> {
	// too short a query matches most of the table
	const trimmedQuery = query.trim()
	if (trimmedQuery.length < SEARCH_MIN_CHARS) {
		return []
	}

	// an admin may open every topic, and everyone else the topics the view rules allow
	const isAdmin = userId ? (await loadUserAccess(userId)).isAdmin : false
	return toTopicSearchQuery({ userId, query: trimmedQuery, isAdmin })
}

// the search options, with whether the user is an admin
export type ToTopicSearchQueryOptions = SearchTopicsOptions & { isAdmin: boolean }

/**
 * Returns the topic search's query.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toTopicSearchQuery({ userId, query, isAdmin }: ToTopicSearchQueryOptions) {
	// the name match, with the typed characters escaped so none acts as a wildcard
	const isNameMatch = like(sql`lower(${topics.name})`, toContainsLikePattern(query))

	// shorter names sort first, where a larger portion of the name was matched
	return db
		.select({ id: topics.id, name: topics.name })
		.from(topics)
		.where(isAdmin ? isNameMatch : and(isNameMatch, toTopicViewFilter(userId)))
		.orderBy(sql`length(${topics.name})`)
		.limit(USER_SEARCH_LIMIT)
}

// the topic search route, mounted ahead of the topic routes so /topics/search is never read as a topic id
export const topicSearchRoute = new Hono<AppEnv>().get("/topics/search", searchRateLimiter, async (context) =>
	context.json({ topics: await searchTopics({ userId: currentUser(context), query: context.req.query("q") ?? "" }) }),
)
