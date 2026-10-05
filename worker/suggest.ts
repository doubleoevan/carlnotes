// proposes Sources a Topic could follow, read from its own title, prompt, and attachments
import { toHostWithoutWww } from "@shared/seo"
import { customSourceKeys, toGoogleNewsPublisherFeedUrl, toPublisherDomain } from "@shared/sources"
import { generateText, Output } from "ai"
import { z } from "zod"
import { fetchAuthorFeed } from "./ingest/bluesky"
import { FeedStatusError, fetchFeed } from "./ingest/feed"
import type { NewResource } from "./ingest/ingester"
import { toCanonicalUrl } from "./ingest/normalize"
import { searchPodcasts } from "./ingest/podcast"
import { fetchSubredditFeed, toSubredditName } from "./ingest/reddit"
import { parseResults, runSearch } from "./ingest/search"
import { readHandle } from "./ingest/x"
import { toAtomUrl, toYoutubeSourceId } from "./ingest/youtube"
import { cheapModel } from "./models"
import { fetchPromptTemplate, promptTelemetry } from "./prompts/fetch"
import { writePrompt } from "./prompts/write"
import { fetchPublicUrl, readLimitedBody } from "./publicFetch"

// one suggested Source: the custom source option it is added through, and its value
export type SuggestedSource = { sourceOption: (typeof customSourceKeys)[number]; value: string; name?: string }

// what one suggestion request reads
export type SuggestionContext = {
	name: string
	prompt: string
	attachmentContext: string
	excludeSources: SuggestedSource[]
	limit: number
	litellmApiKey?: string
}

// how much of the topic's own text reaches the model, so a very long prompt cannot inflate the model call
const MAX_CONTEXT_CHARS = 4000

// how long a verification fetch may run. a slow suggested source is dropped instead of delaying the reply
const VERIFY_TIMEOUT_MS = 8000

// how many extra sources to ask for beyond what the topic can hold, for suggestions that fail the readability check
const SUGGESTION_HEADROOM = 5

// how many web search pages the model reads, and how much of the topic's text the search query takes
const MAX_WEB_SEARCH_PAGES = 10
const MAX_WEB_SEARCH_QUERY_CHARS = 300

// the model's answer. every field is required, so a namedSource missing its value is filtered out
const suggestionSchema = z.object({
	sources: z.array(z.object({ sourceOption: z.enum(customSourceKeys), value: z.string() })),
})

// the readable suggestions up to the limit, the new suggestion count, and the readable suggestion count.
// a new suggestion resolved to nothing or passed the dedupe, and a readable suggestion also resolved and read
export type SourceSuggestions = {
	suggestedSources: SuggestedSource[]
	newSuggestionCount: number
	readableSuggestionCount: number
}

/**
 * Sources this topic could follow, suggested from its own words, minus anything it already has,
 * and confirmed to be readable before any are returned.
 */
export async function suggestSources(suggestionContext: SuggestionContext): Promise<SuggestedSource[]> {
	const sourceSuggestions = await toSourceSuggestions(suggestionContext)
	return sourceSuggestions.suggestedSources
}

/**
 * Returns the readable suggestions up to the limit, with the new and the readable suggestion counts.
 */
export async function toSourceSuggestions(suggestionContext: SuggestionContext): Promise<SourceSuggestions> {
	// a topic that has added its limit of sources gets no suggestions
	if (suggestionContext.limit <= 0) {
		return { suggestedSources: [], newSuggestionCount: 0, readableSuggestionCount: 0 }
	}

	// ask the model to suggest sources up to the limit of what can be added
	const suggestedSources = await generateSourceSuggestions(suggestionContext)

	// a name and the id it resolves to are different keys, which is why a resolved suggestion is deduped a second time
	const resolvedSources = await Promise.all(suggestedSources.map(toResolvedSource))
	const namedSources = resolvedSources.filter((source) => source !== null)

	// drop what the topic already follows before wasting a fetch to confirm it
	const excludedKeys = new Set(suggestionContext.excludeSources.map(toSourceKey))
	const filteredSources = namedSources.filter((namedSource) => {
		const sourceKey = toSourceKey(namedSource)
		if (excludedKeys.has(sourceKey)) {
			return false
		}

		// new key, so this namedSource stays and any later duplicate of it is dropped
		excludedKeys.add(sourceKey)
		return true
	})

	// confirm each suggested source the way its ingester will read it
	const readableSourceIndexes = await Promise.all(filteredSources.map(isReadable))
	const readableSources = filteredSources.filter((_, index) => readableSourceIndexes[index])

	// return the readable suggestions up to the limit, with the new and the readable suggestion counts
	const unresolvedSourceCount = resolvedSources.length - namedSources.length
	return {
		suggestedSources: readableSources.slice(0, suggestionContext.limit),
		newSuggestionCount: unresolvedSourceCount + filteredSources.length,
		readableSuggestionCount: readableSources.length,
	}
}

// the suggestion as its ingester will store it
async function toResolvedSource(suggestedSource: SuggestedSource): Promise<SuggestedSource | null> {
	// look up a channel or a show, and drop a value that names neither
	if (suggestedSource.sourceOption === "youtube") {
		return toResolvedYoutubeSource(suggestedSource)
	}
	if (suggestedSource.sourceOption === "podcast") {
		return toResolvedPodcastSource(suggestedSource)
	}

	// name a publisher written as a url by its bare domain
	if (suggestedSource.sourceOption === "googleNews") {
		return { ...suggestedSource, value: toPublisherDomain(suggestedSource.value) ?? suggestedSource.value }
	}

	// read a feed or a page written without its scheme over https
	if (suggestedSource.sourceOption === "rss" || suggestedSource.sourceOption === "url") {
		const url = /^https?:\/\//i.test(suggestedSource.value) ? suggestedSource.value : `https://${suggestedSource.value}`

		// resolve a page proposed as a feed to the feed that the page's link tags advertise
		const value = suggestedSource.sourceOption === "rss" ? await toAdvertisedFeedUrl(url) : url
		return { ...suggestedSource, value }
	}

	// every other kind names what its Source stores already
	return suggestedSource
}

// a channel suggestion as the channel or playlist id that its value names, or null if the value names neither
async function toResolvedYoutubeSource(suggestedSource: SuggestedSource): Promise<SuggestedSource | null> {
	const youtubeId = await toYoutubeSourceId(suggestedSource.value)

	// drop a value that names no channel or playlist
	if (!youtubeId) {
		console.log(`dropped a youtube suggestion that named no channel or playlist: ${suggestedSource.value}`)
		return null
	}

	// a username is what the channel is called, so the username shows as the name until a scan stores the real title
	const username = suggestedSource.value.trim()
	return { ...suggestedSource, value: youtubeId, name: username.startsWith("@") ? username : undefined }
}

// a show suggestion as the id of the first iTunes show of that name that publishes a feed, or null if iTunes finds none
async function toResolvedPodcastSource(suggestedSource: SuggestedSource): Promise<SuggestedSource | null> {
	// search iTunes for the suggested name, and keep the show of that exact name that publishes a feed,
	// or else the first show with a feed whose name holds the suggested name or is held by it
	const podcasts = await searchPodcasts(suggestedSource.value).catch(() => [])
	const feedPodcasts = podcasts.filter((foundPodcast) => foundPodcast.feedUrl)
	const comparableSuggestedName = toComparableShowName(suggestedSource.value)
	const podcast =
		feedPodcasts.find(
			(foundPodcast) =>
				comparableSuggestedName !== "" && toComparableShowName(foundPodcast.name) === comparableSuggestedName,
		) ??
		feedPodcasts.find((foundPodcast) =>
			isSameShowName({ suggestedName: suggestedSource.value, showName: foundPodcast.name }),
		)

	// drop a name that finds no show with a feed, and return the show's id and the show's name
	if (!podcast) {
		console.log(`dropped a podcast suggestion naming no show that publishes a feed: ${suggestedSource.value}`)
		return null
	}
	return { ...suggestedSource, value: podcast.podcastId, name: podcast.name }
}

// the name that a suggestion gave a show, and the name of a show that iTunes found
type IsSameShowNameOptions = { suggestedName: string; showName: string }

/**
 * Checks whether either show name holds the other, ignoring case and every character but ascii letters and digits.
 */
export function isSameShowName({ suggestedName, showName }: IsSameShowNameOptions): boolean {
	const comparableSuggestedName = toComparableShowName(suggestedName)
	const comparableShowName = toComparableShowName(showName)
	if (!comparableSuggestedName || !comparableShowName) {
		return false
	}
	return comparableShowName.includes(comparableSuggestedName) || comparableSuggestedName.includes(comparableShowName)
}

// a show name in lower case with only its ascii letters and digits
function toComparableShowName(showName: string): string {
	return showName.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

// the feed that a page's link tags advertise, or the url itself if the url is not a readable html page with a feed link
async function toAdvertisedFeedUrl(url: string): Promise<string> {
	// keep the url if the lookup outlasts the verification deadline, dns lookup included
	const deadline = new Promise<string>((resolve) => setTimeout(() => resolve(url), VERIFY_TIMEOUT_MS))
	return Promise.race([readAdvertisedFeedUrl(url), deadline])
}

// fetch the page and read the feed that its link tags advertise, or keep the url
async function readAdvertisedFeedUrl(url: string): Promise<string> {
	try {
		// fetch the page, and keep the url if the response is not an ok html page
		const response = await fetchPublicUrl(url, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
		if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
			await response.body?.cancel()
			return url
		}

		// resolve the advertised feed against the requested url
		const feedHref = toAdvertisedFeedHref(await readLimitedBody(response, url))
		return feedHref ? new URL(feedHref, url).href : url
	} catch {
		// keep the url of a page that cannot be read
		return url
	}
}

/**
 * Returns the address of the first rss or atom feed link in a page, or undefined if the page has no feed link.
 */
export function toAdvertisedFeedHref(html: string): string | undefined {
	for (const [linkTag] of html.matchAll(/<link\b[^>]*>/gi)) {
		// a feed link is an alternate link of an rss or atom type with an address
		const isFeedLink =
			/\brel=["']?alternate\b/i.test(linkTag) && /\btype=["']?application\/(?:rss|atom)\+xml/i.test(linkTag)
		const feedHref = linkTag.match(/\bhref=["']([^"']+)["']/i)?.[1]

		// return the first feed link's address, with its encoded ampersands decoded
		if (isFeedLink && feedHref) {
			return feedHref.replaceAll("&amp;", "&")
		}
	}
	return undefined
}

/**
 * The identity two Sources are deduped by. An rss feed is identified by host,
 * so a topic already following a publication is not offered a second feed from it under a different path.
 */
export function toSourceKey(source: SuggestedSource): string {
	// a subreddit reads the same no matter how it was written, and a YouTube id is exact
	if (source.sourceOption === "reddit") {
		return `reddit:${(toSubredditName(source.value) ?? source.value).toLowerCase()}`
	}
	if (source.sourceOption === "youtube") {
		return `youtube:${source.value}`
	}

	// a show is identified by its podcast id, which is exact
	if (source.sourceOption === "podcast") {
		return `podcast:${source.value.trim().toLowerCase()}`
	}

	// a Google News source covers one publisher, so it is the same source as that publisher's own feed
	if (source.sourceOption === "googleNews") {
		return `rss:${toPublisherDomain(source.value) ?? source.value.trim().toLowerCase()}`
	}

	// a bluesky account is named by its username, which is a domain name and reads the same in any case
	if (source.sourceOption === "bluesky") {
		return `bluesky:${source.value.replace(/^@/, "").toLowerCase()}`
	}

	// an x username is case-insensitive, and people write it with or without its @
	if (source.sourceOption === "x") {
		return `x:${source.value.replace(/^@/, "").toLowerCase()}`
	}

	// a page is identified by its whole address, and a feed is identified by its host
	const canonicalUrl = toCanonicalUrl(source.value)
	if (source.sourceOption === "url") {
		return `url:${canonicalUrl}`
	}
	return `rss:${toHostWithoutWww(canonicalUrl)}`
}

/**
 * The topic's own words for the model to read: its title, its prompt, and what its attachments say.
 */
export function toTopicContext(suggestionContext: SuggestionContext): string {
	// the attachment context is included, which says as much about the topic as the prompt
	const attachedWords = suggestionContext.attachmentContext
		? `\n\nFrom the reader's attachments:\n${suggestionContext.attachmentContext}`
		: ""
	return `Title: ${suggestionContext.name}\n\nWhat the reader is looking for:\n${suggestionContext.prompt}${attachedWords}`.slice(
		0,
		MAX_CONTEXT_CHARS,
	)
}

// the model's suggestions, before anything is filtered or confirmed. a failed call suggests nothing
async function generateSourceSuggestions(suggestionContext: SuggestionContext): Promise<SuggestedSource[]> {
	const topicContext = toTopicContext(suggestionContext)
	const excludedSources = suggestionContext.excludeSources
		.map((source) => `- ${source.sourceOption}: ${source.value}`)
		.join("\n")

	// load the pages that a web search for the topic finds, and write the prompt with them
	const webSearchResources = await loadWebSearchResources(suggestionContext)
	const webSearchPages = toWebSearchPages(webSearchResources)
	const { template, name, registryPrompt } = await fetchPromptTemplate("suggest-sources")
	const builtPrompt = {
		prompt: writePrompt(
			template,
			{ topicContext, excludedSources: excludedSources || "None.", webSearchPages },
			{ maxSuggestions: String(suggestionContext.limit + SUGGESTION_HEADROOM) },
		),
		name,
		registryPrompt,
	}

	// a model that fails suggests nothing, which the editor reports as nothing found
	try {
		const { output } = await generateText({
			model: cheapModel(suggestionContext.litellmApiKey),
			output: Output.object({ schema: suggestionSchema }),
			prompt: builtPrompt.prompt,
			...promptTelemetry(builtPrompt),
		})

		// drop each value's option prefix, then leave out an empty value and a search result proposed as a page to follow
		const webSearchUrls = new Set(webSearchResources.map(({ url }) => toCanonicalUrl(url)))
		const isWebSearchResult = (suggestedSource: SuggestedSource): boolean =>
			suggestedSource.sourceOption === "url" && webSearchUrls.has(toCanonicalUrl(suggestedSource.value))
		const unprefixedSuggestedSources = output.sources.map((suggestedSource) => ({
			...suggestedSource,
			value: toValueWithoutOption(suggestedSource),
		}))
		return unprefixedSuggestedSources.filter(
			(suggestedSource) => suggestedSource.value && !isWebSearchResult(suggestedSource),
		)
	} catch (error) {
		// report the failed call, and suggest nothing
		console.error("source suggestion generation failed", error)
		return []
	}
}

/**
 * Returns the suggestion's trimmed value without its option prefix, as in googleNews:example.com.
 */
export function toValueWithoutOption(suggestedSource: SuggestedSource): string {
	const value = suggestedSource.value.trim()
	const optionPrefix = `${suggestedSource.sourceOption.toLowerCase()}:`
	return value.toLowerCase().startsWith(optionPrefix) ? value.slice(optionPrefix.length).trim() : value
}

/**
 * Returns the pages that a web search for the topic finds, or none without a search key or after a failed search.
 */
export async function loadWebSearchResources({ name, prompt }: SuggestionContext): Promise<NewResource[]> {
	// a deployment with no search key suggests from the topic's words alone
	if (!Bun.env.EXA_API_KEY) {
		return []
	}

	// search for the topic's title and the start of its prompt
	try {
		const searchResponse = await runSearch(`${name}: ${prompt}`.slice(0, MAX_WEB_SEARCH_QUERY_CHARS))
		return parseResults(searchResponse).resources.slice(0, MAX_WEB_SEARCH_PAGES)
	} catch (error) {
		// a search that fails leaves the model with the topic's words alone
		console.error("source suggestion web search failed", error)
		return []
	}
}

/**
 * Lists each web search page's title, host, and address on its own line, or "None." if there are none.
 */
export function toWebSearchPages(webSearchResources: NewResource[]): string {
	const webSearchPageLines = webSearchResources.map((webSearchResource) => {
		const host = toHostWithoutWww(webSearchResource.url)
		const title = webSearchResource.title?.replace(/\s+/g, " ").trim() || host
		return `- ${title} (${host}): ${webSearchResource.url}`
	})
	return webSearchPageLines.join("\n") || "None."
}

// whether a namedSource can actually be read, fetched the way its own ingester reads it
async function isReadable(suggestedSource: SuggestedSource): Promise<boolean> {
	try {
		// a host that hangs counts as temporarily unconfirmed instead of keeping the response open
		await Promise.race([
			readSuggestedSource(suggestedSource),
			new Promise((_, reject) =>
				setTimeout(() => reject(new DOMException("verification timed out", "TimeoutError")), VERIFY_TIMEOUT_MS),
			),
		])
		return true
	} catch (error) {
		// a rate limit or a server error is the host saying "not now", not "no such source"
		if (isTemporaryFailure(error, suggestedSource.sourceOption)) {
			console.log(`kept a ${suggestedSource.sourceOption} suggestion the host would not confirm: ${String(error)}`)
			return true
		}
		console.log(`dropped an unreadable ${suggestedSource.sourceOption} suggestion: ${String(error)}`)
		return false
	}
}

/**
 * Whether the host would not answer instead of answering that the source is not there.
 */
export function isTemporaryFailure(error: unknown, sourceOption: SuggestedSource["sourceOption"]): boolean {
	// a timeout or a dropped connection never reached a status at all
	if (!(error instanceof FeedStatusError)) {
		return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
	}

	// reddit returns 403 to every request from an IP range it blocks
	if (sourceOption === "reddit" && error.status === 403) {
		return true
	}
	return error.status === 429 || error.status >= 500
}

// read the suggested source through the same helper its ingester uses
async function readSuggestedSource(suggestedSource: SuggestedSource): Promise<void> {
	// a subreddit is confirmed through the keyless feed the reddit ingester falls back to
	if (suggestedSource.sourceOption === "reddit") {
		const subreddit = toSubredditName(suggestedSource.value)
		if (!subreddit) {
			throw new Error(`${suggestedSource.value} is not a subreddit name reddit would accept`)
		}
		await fetchSubredditFeed(subreddit)
		return
	}

	// a podcast was already resolved from a show name to its id, which only succeeds for a show iTunes lists
	if (suggestedSource.sourceOption === "podcast") {
		return
	}

	// a channel or playlist is confirmed through its Atom feed, which is the YouTube ingester's keyless path
	if (suggestedSource.sourceOption === "youtube") {
		await fetchFeed(toAtomUrl(suggestedSource.value), { resourceKind: "watch" })
		return
	}

	// a Google News source is confirmed through the publisher feed stored for it
	if (suggestedSource.sourceOption === "googleNews") {
		const publisherFeedUrl = toGoogleNewsPublisherFeedUrl(suggestedSource.value)
		if (!publisherFeedUrl) {
			throw new Error(`a google news suggestion named no publisher domain: ${suggestedSource.value}`)
		}

		// Google returns an empty feed for a publisher it never heard of, so an empty one is a publisher that isn't there
		const publisherArticles = await fetchFeed(publisherFeedUrl)
		if (publisherArticles.length === 0) {
			throw new Error(`google news has nothing from ${suggestedSource.value}`)
		}
		return
	}

	// a feed has to parse as a feed. a page that merely returns 200 is not a valid feed
	if (suggestedSource.sourceOption === "rss") {
		await fetchFeed(suggestedSource.value)
		return
	}

	// a bluesky account is confirmed through the same keyless appview its ingester uses, asking for one post
	if (suggestedSource.sourceOption === "bluesky") {
		await fetchAuthorFeed(suggestedSource.value.replace(/^@/, ""), 1)
		return
	}

	// an x username is confirmed by looking the account up instead of reading its tweets
	if (suggestedSource.sourceOption === "x") {
		await readHandle(suggestedSource.value)
		return
	}

	// a page only has to answer
	const response = await fetchPublicUrl(suggestedSource.value, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
	if (!response.ok) {
		throw new FeedStatusError(suggestedSource.value, response.status)
	}
}
