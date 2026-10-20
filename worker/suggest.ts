// proposes Sources a Topic could follow, read from its own title, prompt, and attachments
import { toHostWithoutWww } from "@shared/seo"
import { customSourceKeys, toPublisherDomain } from "@shared/sources"
import { toOneLineText } from "@shared/text"
import { generateText, Output } from "ai"
import { z } from "zod"
import type { NewResource } from "./ingest/ingester"
import { toCanonicalUrl } from "./ingest/normalize"
import { toSubredditName } from "./ingest/reddit"
import { parseResults, runSearch } from "./ingest/search"
import { cheapModel } from "./models"
import { fetchPromptTemplate, promptTelemetry } from "./prompts/fetch"
import { writePrompt } from "./prompts/write"
import { isSuggestedSourceReadable, toResolvedSource } from "./suggestedSourceChecks"

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
	const readableSourceIndexes = await Promise.all(filteredSources.map(isSuggestedSourceReadable))
	const readableSources = filteredSources.filter((_, index) => readableSourceIndexes[index])

	// return the readable suggestions up to the limit, with the new and the readable suggestion counts
	const unresolvedSourceCount = resolvedSources.length - namedSources.length
	return {
		suggestedSources: readableSources.slice(0, suggestionContext.limit),
		newSuggestionCount: unresolvedSourceCount + filteredSources.length,
		readableSuggestionCount: readableSources.length,
	}
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
		const title = toOneLineText(webSearchResource.title ?? "") || host
		return `- ${title} (${host}): ${webSearchResource.url}`
	})
	return webSearchPageLines.join("\n") || "None."
}
