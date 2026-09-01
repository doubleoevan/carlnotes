// the Source registry: the default set that every new Topic starts with and the custom options that can be added,
import type { editableSourceKinds } from "./enums"

// the Google News feed host, and its locale as all three parameters. the app has no per-user locale to read yet
const GOOGLE_NEWS_HOST = "news.google.com"
const GOOGLE_NEWS_LOCALE = "hl=en-US&gl=US&ceid=US:en"
// the Google News search filter that scopes a feed to one publisher
const PUBLISHER_FILTER = "site:"

// the source kinds a source is saved as
export type EditableSourceKind = (typeof editableSourceKinds)[number]

// the custom source options and suggested source keys
export const customSourceKeys = ["url", "rss", "googleNews", "reddit", "youtube", "podcast", "bluesky", "x"] as const
export type CustomSourceKey = (typeof customSourceKeys)[number]

// a default Source, on for every new topic, with its sourceKind and toConfig save it, and label and summary to render it
export type DefaultSource = {
	key: string
	sourceKind: EditableSourceKind
	label: string
	summary: string
	toConfig: () => Record<string, unknown>
}

// an option in the custom source picker
export type CustomSourceOption = {
	key: CustomSourceKey
	sourceKind: EditableSourceKind
	label: string
	placeholder: string
	toConfig: (value: string) => Record<string, unknown> | null
}

/**
 * The default Sources a new topic starts with, in display order.
 */
export const DEFAULT_SOURCES: DefaultSource[] = [
	// web search is the only default source for now
	{ key: "webSearch", sourceKind: "search", label: "web", summary: "Let Carl crawl", toConfig: () => ({}) },
]

/**
 * The options the custom source picker offers, in the order it lists them.
 */
export const CUSTOM_SOURCE_OPTIONS: CustomSourceOption[] = [
	// a page and an rss feed are both named by their url. what differs is the ingester that reads it
	{ key: "url", sourceKind: "url", label: "url", placeholder: "page url…", toConfig: (value) => ({ url: value }) },
	{ key: "rss", sourceKind: "rss", label: "rss", placeholder: "feed url…", toConfig: (value) => ({ url: value }) },
	// Google News is an rss feed of one publisher's articles, built from the publisher's domain
	{
		key: "googleNews",
		sourceKind: "rss",
		label: "Google News",
		placeholder: "publisher domain…",
		toConfig: toGoogleNewsSourceConfig,
	},
	// a reddit source takes its subreddit with any leading r/ stripped
	{
		key: "reddit",
		sourceKind: "reddit",
		label: "reddit",
		placeholder: "subreddit…",
		toConfig: (value) => ({ subreddit: value.replace(/^r\//, "") }),
	},
	// a YouTube source takes a channel id or a playlist id
	{
		key: "youtube",
		sourceKind: "youtube",
		label: "youtube",
		placeholder: "channel or playlist id…",
		toConfig: toYouTubeConfig,
	},
	// a podcast source names one show by its podcast id. its show name is written back at save and on each scan
	{
		key: "podcast",
		sourceKind: "podcast",
		label: "podcast",
		placeholder: "podcast id…",
		toConfig: (value) => ({ podcastId: value }),
	},
	// a bluesky source reads the links one account shares, named by its handle with any leading @ stripped
	{
		key: "bluesky",
		sourceKind: "bluesky",
		label: "bluesky",
		placeholder: "account handle…",
		toConfig: (value) => ({ handle: value.replace(/^@/, "") }),
	},
	// an x source follows one account, named by its handle with any leading @ stripped
	{
		key: "x",
		sourceKind: "x",
		label: "x",
		placeholder: "account handle…",
		toConfig: (value) => ({ handle: value.replace(/^@/, "") }),
	},
]

/**
 * The default Source for a source kind, or null if it is a custom source kind.
 */
export function toDefaultSource(sourceKind: string): DefaultSource | null {
	return DEFAULT_SOURCES.find((defaultSource) => defaultSource.sourceKind === sourceKind) ?? null
}

/**
 * The custom source mapped to its select option.
 */
export function toCustomSourceOption(optionKey: string): CustomSourceOption | undefined {
	return CUSTOM_SOURCE_OPTIONS.find((option) => option.key === optionKey)
}

// which config fields hold what the ingester reads, per source kind. every other kind reads its url
const SOURCE_VALUE_FIELDS: Record<string, string[]> = {
	podcast: ["podcastId"],
	youtube: ["channelId", "playlistId"],
	reddit: ["subreddit"],
	bluesky: ["handle"],
	x: ["handle"],
}

/**
 * What a source is identified by: the id, handle, subreddit, or url its ingester reads.
 * Never the display name a Scan wrote back. A suggestion resolves to this same value before it is deduped,
 * and keying on the name would offer a source the topic already follows.
 */
export function toSourceValue(sourceKind: string, config: Record<string, unknown>): string {
	const fields = SOURCE_VALUE_FIELDS[sourceKind] ?? ["url"]
	const value = fields.map((field) => config[field]).find((field) => typeof field === "string")
	return typeof value === "string" ? value : ""
}

/**
 * The one-line display summary of a source's config: publisher, feed host, subreddit, or channel/playlist id.
 */
export function toSourceSummary(sourceKind: string, config: Record<string, unknown>): string {
	// each source kind names its config differently. an unknown kind or a missing value falls back to an empty summary
	const { url, subreddit, query, channelId, playlistId, podcastId, name, handle } = config
	if (sourceKind === "rss" && typeof url === "string") {
		// a Google News feed is named by the publisher it covers, not by Google's own host
		return toGoogleNewsPublisher(url) ?? toUrlHost(url) ?? url
	}

	// a url source uses the full path
	if (sourceKind === "url" && typeof url === "string") {
		return url
	}

	// a search source is the built-in web search. its ingester ignores the config. the user provides the query.
	if (sourceKind === "search") {
		return ""
	}

	// a podcast source is the show's name once its ingester has stored one
	if (sourceKind === "podcast") {
		return toNamedSummary(name, podcastId)
	}

	// a reddit source names the subreddit it reads, the query it searches inside it, or both
	if (sourceKind === "reddit") {
		return toRedditSummary(subreddit, query)
	}

	// a bluesky or x source names the account it follows
	if ((sourceKind === "bluesky" || sourceKind === "x") && typeof handle === "string" && handle.trim()) {
		return `@${handle.trim().replace(/^@/, "")}`
	}

	// a YouTube source is its id, and its channel or playlist name once its ingester has stored one
	if (sourceKind === "youtube") {
		const youtubeId = [channelId, playlistId].find((id) => typeof id === "string")
		return toNamedSummary(name, youtubeId)
	}
	return ""
}

// a reddit summary is the subreddit, the query searched inside it, or both joined
function toRedditSummary(subreddit: unknown, query: unknown): string {
	const subredditLabel = typeof subreddit === "string" ? `r/${subreddit}` : ""
	const queryLabel = typeof query === "string" ? query : ""
	return [subredditLabel, queryLabel].filter(Boolean).join(" · ")
}

// a source stored by an opaque id is the name its ingester writes back on the first scan. or its id as a fallback
function toNamedSummary(name: unknown, id: unknown): string {
	if (typeof name === "string" && name) {
		return name
	}
	return typeof id === "string" ? id : ""
}

/**
 * Return the host for the url or null if the url is invalid.
 */
export function toUrlHost(url: string): string | null {
	try {
		return new URL(url).host
	} catch {
		return null
	}
}

/**
 * The Google News RSS search feed for a query, or null if the query is blank.
 */
export function toGoogleNewsFeedUrl(query: string): string | null {
	// a blank query has nothing to search for
	const searchQuery = query.trim().replace(/\s+/g, " ")
	if (!searchQuery) {
		return null
	}
	return `https://${GOOGLE_NEWS_HOST}/rss/search?q=${encodeURIComponent(searchQuery)}&${GOOGLE_NEWS_LOCALE}`
}

/**
 * The publisher a Google News feed is scoped to, or null if the url is not a publisher feed.
 */
export function toGoogleNewsPublisher(feedUrl: string): string | null {
	// only a Google News feed names a publisher, and it names it in the search query
	let searchQuery: string | null = null
	try {
		const url = new URL(feedUrl)
		searchQuery = url.host === GOOGLE_NEWS_HOST ? url.searchParams.get("q") : null
	} catch {
		return null
	}

	// the publisher is whatever the search query filter names
	return searchQuery?.startsWith(PUBLISHER_FILTER) ? searchQuery.slice(PUBLISHER_FILTER.length) : null
}

/**
 * The Google News feed covering one publisher, or null if the value has no domain.
 */
export function toGoogleNewsPublisherFeedUrl(publisher: string): string | null {
	const publisherDomain = toPublisherDomain(publisher)
	return publisherDomain ? toGoogleNewsFeedUrl(`${PUBLISHER_FILTER}${publisherDomain}`) : null
}

/**
 * The bare domain a pasted publisher value holds, or null if it has none.
 */
export function toPublisherDomain(value: string): string | null {
	// drop the scheme, then everything from the path on and a leading www, so a pasted article url still names its publisher
	const withoutScheme = value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
	const publisherHost = withoutScheme.split(/[/?#]/)[0]?.replace(/^www\./, "")

	// a value with no dot in it has no domain, so it returns null instead of an empty feed
	return publisherHost?.includes(".") ? publisherHost : null
}

// the Google News option's config, which is the feed of one publisher's articles. a value with no domain builds nothing
function toGoogleNewsSourceConfig(value: string): Record<string, unknown> | null {
	const url = toGoogleNewsPublisherFeedUrl(value)
	return url ? { url } : null
}

// the YouTube option's config. playlist ids start with PL by convention, and everything else is read as a channel id
function toYouTubeConfig(value: string): Record<string, unknown> {
	return value.startsWith("PL") ? { playlistId: value } : { channelId: value }
}
