// the site search: one function behind the search bar, the search page, and the mcp search tool, and its route
import {
	SEARCH_MIN_CHARS,
	type SearchRequest,
	type SearchResultKind,
	type SearchResultsPage,
	type SearchRow,
	toSearchRequest,
} from "@carlnotes/contracts/search"
import { loadUserAccess } from "@carlnotes/db/quotas"
import type { SQL } from "drizzle-orm"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { searchPodcastEpisodes } from "../podcast/podcastEpisodeSearch"
import { searchUsers } from "../profiles"
import { searchRateLimiter } from "../rateLimit"
import { searchTeams } from "../team/search"
import { searchTopics } from "../topic/search"
import { resolveClientAddress } from "../trustedProxies"
import { loadFindingTopicPodcastEpisodes, searchFindings } from "./findingSearch"
import { isTaglessKindLeftOut, toFindingFilter, toTopicTagFilter } from "./searchFilters"
import { toRankedSearchRows, toSearchPage } from "./searchRanks"

// the most rows the search reads of each kind
// ponytail: the union holds at most 250 rows, so a query matching more than 50 of a kind shows 50. page each kind by
// a keyset if that limit shows
export const SEARCH_KIND_LIMIT = 50

// who is searching, the client address a visitor's embedding counts under, and the search
export type SearchSiteOptions = { userId: string | null; clientAddress: string | null; searchRequest: SearchRequest }

// what every kind's reader takes: who is searching, the query, the most rows to read, and the filters. the tag filter
// narrows what belongs to a topic, and the finding filter narrows findings
type SearchReaderOptions = {
	// who is searching, and what for
	userId: string | null
	isAdmin: boolean
	query: string
	clientAddress: string | null
	// how many rows to read, and the filters
	limit: number
	topicTagFilter: SQL | undefined
	findingFilter: SQL | undefined
}

// the kinds that belong to no topic, so have no tags
const TAGLESS_RESULT_KINDS: SearchResultKind[] = ["teams", "users"]

// the reader of each kind
const SEARCH_READERS: Record<SearchResultKind, (searchReaderOptions: SearchReaderOptions) => Promise<SearchRow[]>> = {
	topics: searchTopics,
	podcastEpisodes: searchPodcastEpisodes,
	findings: searchFindings,
	teams: searchTeams,
	users: searchUsers,
}

/**
 * Searches every requested kind under its view rules, ranks the rows together, and returns the requested page.
 */
export async function searchSite({
	userId,
	clientAddress,
	searchRequest,
}: SearchSiteOptions): Promise<SearchResultsPage> {
	// too short a query matches most of every table
	const query = searchRequest.q
	if (query.length < SEARCH_MIN_CHARS) {
		return { ...toSearchPage([], searchRequest), podcastEpisodes: [] }
	}

	// the filters, and the kinds they leave
	const topicTagFilter = toTopicTagFilter(searchRequest)
	const findingFilter = toFindingFilter({ ...searchRequest, userId })
	const searchResultKinds = toFilteredResultKinds(searchRequest)

	// read every requested kind at once. an admin may read every topic, podcast episode, and finding
	const isAdmin = userId ? (await loadUserAccess(userId)).isAdmin : false
	const searchReaderOptions = {
		userId,
		isAdmin,
		query,
		clientAddress,
		limit: SEARCH_KIND_LIMIT,
		topicTagFilter,
		findingFilter,
	}
	const searchRowsByKind = await Promise.all(
		searchResultKinds.map((searchResultKind) => SEARCH_READERS[searchResultKind](searchReaderOptions)),
	)

	// rank the rows together and cut the page, then read the podcast episodes of the page's finding topics alone
	const rankedRows = toRankedSearchRows({ searchRows: searchRowsByKind.flat(), query, sort: searchRequest.sort })
	const searchPage = toSearchPage(rankedRows, searchRequest)
	return { ...searchPage, podcastEpisodes: await loadFindingTopicPodcastEpisodes(searchPage.rows, userId) }
}

// the kinds the filters leave. unread and bookmarked are marks only a finding has, so either view leaves the findings
// alone, and tags a result must have leave out teams and profiles, which have none
function toFilteredResultKinds(searchRequest: SearchRequest): SearchResultKind[] {
	if (searchRequest.view !== "all") {
		return searchRequest.kinds.filter((searchResultKind) => searchResultKind === "findings")
	}
	return isTaglessKindLeftOut(searchRequest)
		? searchRequest.kinds.filter((searchResultKind) => !TAGLESS_RESULT_KINDS.includes(searchResultKind))
		: searchRequest.kinds
}

// the search route, behind the search rate limit. a query value the contract rejects reads as its default
export const searchRoute = new Hono<AppEnv>().get("/search", searchRateLimiter, async (context) =>
	context.json(
		await searchSite({
			userId: currentUser(context),
			clientAddress: resolveClientAddress(context.req.raw),
			searchRequest: toSearchRequest(context.req.query()),
		}),
	),
)
