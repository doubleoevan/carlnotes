// the site search contracts: the request the search bar, the search page's url, and the mcp search tool share, the
// rows it returns, and the query limits
import { z } from "zod"
import { resourceKinds, type visibilities } from "./enums"
import { TAG_MATCH_MODES, TOPIC_FINDING_FILTERS, TOPIC_FINDING_SORTS, type TopicFinding } from "./findings"
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./pagination"
import type { PodcastEpisode, PodcastEpisodeSummary } from "./podcast"
import type { ProfileIdentity } from "./profiles"
import type { TeamIdentity } from "./teams"
import { MAX_TOPIC_DRAFT_TAGS, TOPIC_DRAFT_TAG_CHARS } from "./topics"

// how long a query must be before it searches, and the most characters of a query the search reads
export const SEARCH_MIN_CHARS = 2

export const SEARCH_MAX_CHARS = 200

// which kinds of results the search finds, in the order the Filters menu lists them and ties rank in
export const SEARCH_RESULT_KINDS = ["topics", "podcastEpisodes", "findings", "teams", "users"] as const

export type SearchResultKind = (typeof SEARCH_RESULT_KINDS)[number]

// whether a text value has no NUL character, which Postgres cannot store or compare
function isNulFree(text: string): boolean {
	return !text.includes("\u0000")
}

// whether a list names each item once
function hasEachItemOnce(items: readonly string[]): boolean {
	return new Set(items).size === items.length
}

// a search: the query, the kinds it finds, the finding filters, the topic tags, the sort, the page counted from one,
// and the page size. each list names an item once
export const searchRequestPayload = z.object({
	q: z
		.string()
		.trim()
		.max(SEARCH_MAX_CHARS)
		.refine(isNulFree, "The query may not hold a NUL character.")
		.default("")
		.describe("The text to search for."),
	kinds: z
		.array(z.enum(SEARCH_RESULT_KINDS))
		.min(1)
		.max(SEARCH_RESULT_KINDS.length)
		.refine(hasEachItemOnce, "Name each kind once.")
		.default([...SEARCH_RESULT_KINDS])
		.describe("The kinds of results to find. All of them if left out. users finds profiles."),
	// the filters that narrow findings: their resource kinds, and the view the feed's Filters menu offers
	resourceKinds: z
		.array(z.enum(resourceKinds))
		.min(1)
		.max(resourceKinds.length)
		.refine(hasEachItemOnce, "Name each resource kind once.")
		.default([...resourceKinds])
		.describe("The kinds of findings to find: read, watch, and listen. All of them if left out."),
	view: z
		.enum(TOPIC_FINDING_FILTERS)
		.default("all")
		.describe(
			"Which findings to find: all, unread, or bookmarked. The last two read the connected account's marks " +
				"and find findings alone.",
		),
	// the topic tags that narrow topics, podcast episodes, and findings, and how they match
	tags: z
		.array(z.string().trim().min(1).max(TOPIC_DRAFT_TAG_CHARS).refine(isNulFree, "A tag may not hold a NUL character."))
		.max(MAX_TOPIC_DRAFT_TAGS)
		.default([])
		.describe("Topic tags that narrow the results to topics and what belongs to them."),
	tagMatch: z
		.enum(TAG_MATCH_MODES)
		.default("any")
		.describe("How the tags match a topic: any of them, all of them, none of them, or off to ignore them."),
	sort: z
		.enum(TOPIC_FINDING_SORTS)
		.default("relevant")
		.describe(
			"relevant ranks by how well the name matches, newest by date, and trending by viewers, listeners, and views.",
		),
	page: z.number().int().min(1).default(1).describe("The page to return, counted from 1."),
	size: z
		.number()
		.int()
		.refine((size) => (PAGE_SIZES as readonly number[]).includes(size), `one of ${PAGE_SIZES.join(", ")}`)
		.default(DEFAULT_PAGE_SIZE)
		.describe(`How many results a page holds: ${PAGE_SIZES.join(", ")}.`),
})

export type SearchRequest = z.infer<typeof searchRequestPayload>

// a search's fields, and the ones a url holds as a comma list
type SearchRequestKey = keyof SearchRequest
const LIST_KEYS: SearchRequestKey[] = ["kinds", "resourceKinds", "tags"]
const NUMBER_KEYS: SearchRequestKey[] = ["page", "size"]

// a search as a url's query string holds it, every value a string and each list a comma list
export type SearchUrlParams = Partial<Record<SearchRequestKey, string>>

// the request with every field at its default
const DEFAULT_SEARCH_REQUEST: SearchRequest = searchRequestPayload.parse({})

/**
 * Reads a search from a url's query string. Each value the contract rejects falls back to its default.
 */
export function toSearchRequest(searchUrlParams: SearchUrlParams): SearchRequest {
	// parse each field alone, from the url's spelling of it, so one bad value keeps the rest of the search
	const fieldShapes = searchRequestPayload.shape
	const searchRequestEntries = Object.keys(fieldShapes).map((searchRequestKey) => {
		const key = searchRequestKey as SearchRequestKey
		const urlValue = toFieldValue(key, searchUrlParams[key])
		return [key, fieldShapes[key].safeParse(urlValue).data ?? DEFAULT_SEARCH_REQUEST[key]]
	})
	return Object.fromEntries(searchRequestEntries) as SearchRequest
}

/**
 * Returns a search as a url's query string values, leaving out each value at its default.
 */
export function toSearchUrlParams(searchRequest: SearchRequest): SearchUrlParams {
	// the query always, and every other field that differs from its default, in the contract's order
	const searchUrlEntries = Object.keys(searchRequestPayload.shape).flatMap((searchRequestKey) => {
		const key = searchRequestKey as SearchRequestKey
		const urlText = toUrlText(key, searchRequest[key])
		const defaultUrlText = toUrlText(key, DEFAULT_SEARCH_REQUEST[key])
		return key === "q" || urlText !== defaultUrlText ? [[key, urlText]] : []
	})
	return Object.fromEntries(searchUrlEntries)
}

// a url's text as the contract reads the field: a list split on commas, a number, or the text itself
function toFieldValue(key: SearchRequestKey, urlText: string | undefined): unknown {
	// a field the url leaves out reads as its default
	if (urlText === undefined) {
		return undefined
	}

	// a list, then a number, then the text
	if (LIST_KEYS.includes(key)) {
		return urlText.split(",").filter(Boolean).map(fromUrlListItem)
	}
	return NUMBER_KEYS.includes(key) ? Number(urlText) : urlText
}

// the order the Filters menu lists each list key's items in, so the same search always writes the same url. tags keep
// the order they were picked in
const LIST_ORDERS: Partial<Record<SearchRequestKey, readonly string[]>> = {
	kinds: SEARCH_RESULT_KINDS,
	resourceKinds,
}

// a field's value as a url's text, a list in its menu's order
function toUrlText(key: SearchRequestKey, value: SearchRequest[SearchRequestKey]): string {
	// a single value is its own text
	if (!Array.isArray(value)) {
		return String(value)
	}

	// a list in its menu's order, or as given
	const listOrder = LIST_ORDERS[key]
	const sortedList = listOrder ? listOrder.filter((item) => (value as readonly string[]).includes(item)) : value
	return sortedList.map(toUrlListItem).join(",")
}

// a list item as a url's text, with each comma escaped so it never reads as a separator, and each percent sign so an
// escape always reads back as itself
function toUrlListItem(item: string): string {
	return item.replaceAll("%", "%25").replaceAll(",", "%2C")
}

// a url's list item as the item it escapes
function fromUrlListItem(urlText: string): string {
	return urlText.replaceAll("%2C", ",").replaceAll("%25", "%")
}

/**
 * Returns the search page's path for a search.
 */
export function toSearchPath(searchRequest: SearchRequest): string {
	const searchParams = new URLSearchParams(toSearchUrlParams(searchRequest))
	return `/search?${searchParams.toString()}`
}

// the fields every row has: its id, its name, the path of its page on the site, and the date and count the sorts read
type SearchRowFields = { id: string; name: string; path: string; date: string | null; count: number | null }

// a topic row, with its latest podcast episode the caller may listen to, how many people subscribe to it, and whether a signed-in
// caller does
export type TopicSearchRow = SearchRowFields & {
	kind: "topic"
	topic: { id: string; name: string; latestPodcastEpisode: PodcastEpisodeSummary | null }
	subscriberCount: number
	isSubscribed: boolean | null
}

// a published podcast episode row, with its topic
export type PodcastEpisodeSearchRow = SearchRowFields & {
	kind: "podcastEpisode"
	podcastEpisode: PodcastEpisodeSummary
	topic: { id: string; name: string }
}

// a finding row: the finding as its topic's feed shows it, with the caller's marks, and its topic, whose page is the
// row's path
export type FindingSearchRow = SearchRowFields & {
	kind: "finding"
	finding: TopicFinding
	topic: FindingSearchTopic
}

// a finding row's topic: its name and prompt, which the finding's note copies, its visibility, and whether the caller
// may rate and bookmark its findings
export type FindingSearchTopic = {
	id: string
	name: string
	prompt: string
	visibility: (typeof visibilities)[number]
	canRate: boolean
	canBookmark: boolean
}

// a team row, in the shape its avatar and link read, with how many topics it holds and how many members it has
export type TeamSearchRow = SearchRowFields & {
	kind: "team"
	team: TeamIdentity
	topicCount: number
	memberCount: number
}

// a profile row, in the shape its avatar and link read
export type UserSearchRow = SearchRowFields & { kind: "user"; user: ProfileIdentity }

// one search result of any kind
export type SearchRow = TopicSearchRow | PodcastEpisodeSearchRow | FindingSearchRow | TeamSearchRow | UserSearchRow

// one page of a search: its rows, how many rows the whole search found, where the page sits, and the latest podcast
// episode the caller may listen to of each finding row's topic, once per topic, whose chapters put a pill on the findings
// they narrate
export type SearchResultsPage = {
	rows: SearchRow[]
	rowCount: number
	page: number
	pageCount: number
	pageSize: number
	podcastEpisodes: PodcastEpisode[]
}

// the result type each row kind belongs to
export const SEARCH_ROW_RESULT_KINDS: Record<SearchRow["kind"], SearchResultKind> = {
	topic: "topics",
	podcastEpisode: "podcastEpisodes",
	finding: "findings",
	team: "teams",
	user: "users",
}
