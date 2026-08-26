// proposes Sources a Topic could follow, read from its own title, prompt, and attachments
import { customSourceKeys, toGoogleNewsPublisherFeedUrl, toPublisherDomain } from "@shared/sources"
import { generateText, Output } from "ai"
import { z } from "zod"
import { fetchAuthorFeed } from "./ingest/bluesky"
import { FeedStatusError, fetchFeed } from "./ingest/feed"
import { toCanonicalUrl } from "./ingest/normalize"
import { searchPodcasts } from "./ingest/podcast"
import { fetchSubredditFeed, toSubredditName } from "./ingest/reddit"
import { readHandle } from "./ingest/x"
import { toAtomUrl, toYoutubeSourceId } from "./ingest/youtube"
import { cheapModel } from "./models"
import { fetchPromptTemplate, promptTelemetry } from "./prompts/fetch"
import { writePrompt } from "./prompts/write"
import { fetchPublicUrl } from "./scrape"

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

// how long a verification fetch may run. a slow suggested source is dropped instead of holding up the reply
const VERIFY_TIMEOUT_MS = 8000

// how many extra sources to ask for beyond what the topic can hold
const SUGGESTION_HEADROOM = 3

// the model's answer. every field is required, so a namedSource missing its value is filtered out
const suggestionSchema = z.object({
	sources: z.array(z.object({ sourceOption: z.enum(customSourceKeys), value: z.string() })),
})

/**
 * Sources this topic could follow, suggested from its own words, minus anything it already has,
 * and confirmed to be readable before any are returned.
 */
export async function suggestSources(suggestionContext: SuggestionContext): Promise<SuggestedSource[]> {
	// a topic that has added its limit of sources gets no suggestions
	if (suggestionContext.limit <= 0) {
		return []
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
	return readableSources.slice(0, suggestionContext.limit)
}

// the suggestion as its ingester will store it
async function toResolvedSource(suggestedSource: SuggestedSource): Promise<SuggestedSource | null> {
	// a value naming no channel or playlist is dropped
	if (suggestedSource.sourceOption === "youtube") {
		const youtubeId = await toYoutubeSourceId(suggestedSource.value)

		// nothing to store means nothing to fetch
		if (!youtubeId) {
			console.log(`dropped a youtube suggestion that named no channel or playlist: ${suggestedSource.value}`)
			return null
		}

		// a username is what the channel is called, so it stands in as the name until a scan stores the real title
		const username = suggestedSource.value.trim()
		return { ...suggestedSource, value: youtubeId, name: username.startsWith("@") ? username : undefined }
	}

	// a show is suggested by name
	if (suggestedSource.sourceOption === "podcast") {
		const [podcast] = await searchPodcasts(suggestedSource.value).catch(() => [])
		if (!podcast?.feedUrl) {
			console.log(`dropped a podcast suggestion naming no show that publishes a feed: ${suggestedSource.value}`)
			return null
		}
		return { ...suggestedSource, value: podcast.podcastId, name: podcast.name }
	}

	// every other kind names what its Source stores already
	return suggestedSource
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
	return `rss:${toHost(canonicalUrl)}`
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
	const { template, name, registryPrompt } = await fetchPromptTemplate("suggest-sources")
	const builtPrompt = {
		prompt: writePrompt(
			template,
			{ topicContext, excludedSources: excludedSources || "None." },
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
		return output.sources.filter((source) => source.value.trim())
	} catch (error) {
		console.error("source suggestion generation failed", error)
		return []
	}
}

// whether a namedSource can actually be read, fetched the way its own ingester reads it
async function isReadable(suggestedSource: SuggestedSource): Promise<boolean> {
	try {
		// a host that hangs counts as temporarily unconfirmed instead of holding the response open
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
 * Whether the host refused to answer instead of answering that the source is not there.
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

// a url's host, or the url itself if it does not parse, so that something still identifies an unparseable source
function toHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
	} catch {
		return url
	}
}
