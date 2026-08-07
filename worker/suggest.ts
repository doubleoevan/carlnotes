// proposes Sources a Topic could follow, read from its own title, prompt, and attachments.
// every proposal is fetched the way its ingester will fetch it before the user sees it, so nothing the model invented reaches the editor
import { editableSourceKinds } from "@shared/enums"
import { generateText, Output } from "ai"
import { z } from "zod"
import { fetchFeed } from "./ingest/feed"
import { toCanonicalUrl } from "./ingest/normalize"
import { toAtomUrl } from "./ingest/youtube"
import { cheapModel } from "./models"
import { fetchPromptTemplate, promptTelemetry } from "./prompts/fetch"
import { writePrompt } from "./prompts/write"
import { fetchPublicUrl } from "./scrape"

// one suggested Source, in the shape the editor stages: the sourceKind, and it's value
export type SuggestedSource = { sourceKind: (typeof editableSourceKinds)[number]; value: string }

// what one suggestion request reads. excludeSources are sources that the editor already holds, staged and stored alike
export type SuggestionContext = {
	name: string
	prompt: string
	attachmentContext: string
	excludeSources: SuggestedSource[]
	limit: number
}

// how much of the topic's own text reaches the model, so a very long prompt cannot inflate the model call
const MAX_CONTEXT_CHARS = 4000

// reddit rejects a generic or missing User-Agent on its keyless feeds, the same as the ingester's fallback does
const REDDIT_USER_AGENT = "carlnotes/0.1 (source-suggestion; +https://carlnotes.com)"

// how long a verification fetch may run. a slow suggested source is dropped instead of holding up the reply
const VERIFY_TIMEOUT_MS = 8000

// the model's answer. every field is required, so a candidate missing its value is filtered out
const suggestionSchema = z.object({
	sources: z.array(z.object({ sourceKind: z.enum(editableSourceKinds), value: z.string() })),
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

	// drop what the topic already follows before spending a fetch to confirm it
	const excludedKeys = new Set(suggestionContext.excludeSources.map(toSourceKey))
	const filteredSources = suggestedSources.filter((candidate) => !excludedKeys.has(toSourceKey(candidate)))

	// confirm each suggested source the way its ingester will read it
	const readableSourceIndexes = await Promise.all(filteredSources.map(isReadable))
	const readableSources = filteredSources.filter((_, index) => readableSourceIndexes[index])
	return readableSources.slice(0, suggestionContext.limit)
}

/**
 * The identity two Sources are deduped by. An rss feed is identified by host,
 * so a topic already following a publication is not offered a second feed from it under a different path.
 */
export function toSourceKey(source: SuggestedSource): string {
	// a subreddit reads the same no matter how it was written, and a YouTube id is exact
	if (source.sourceKind === "reddit") {
		return `reddit:${source.value.replace(/^r\//, "").toLowerCase()}`
	}
	if (source.sourceKind === "youtube") {
		return `youtube:${source.value}`
	}

	// the built-in web search has only one identity
	if (source.sourceKind === "search") {
		return "search"
	}

	// a page is identified by its whole address, and a feed is identified by its host
	const canonicalUrl = toCanonicalUrl(source.value)
	if (source.sourceKind === "url") {
		return `url:${canonicalUrl}`
	}
	return `rss:${toHost(canonicalUrl)}`
}

/**
 * The topic's own words for the model to read: its title, its prompt, and what its attachments say.
 */
export function toTopicContext(suggestionContext: SuggestionContext): string {
	// the attachment context is included, since what the owner uploaded says as much about the topic as the prompt
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
		.map((source) => `- ${source.sourceKind}: ${source.value}`)
		.join("\n")
	const { template, name, registryPrompt } = await fetchPromptTemplate("suggest-sources")
	const builtPrompt = {
		prompt: writePrompt(
			template,
			{ topicContext, excludedSources: excludedSources || "None." },
			{ maxSuggestions: String(suggestionContext.limit) },
		),
		name,
		registryPrompt,
	}

	// a model that fails suggests nothing, which the editor reports as nothing found
	try {
		const { output } = await generateText({
			model: cheapModel(),
			output: Output.object({ schema: suggestionSchema }),
			prompt: builtPrompt.prompt,
			...promptTelemetry(builtPrompt),
		})
		return output.sources.filter((source) => source.value.trim() || source.sourceKind === "search")
	} catch (error) {
		console.error("source suggestion generation failed", error)
		return []
	}
}

// whether a candidate can actually be read, fetched the way its own ingester reads it.
// anything that throws, times out, or parses as nothing is dropped without failing the request
async function isReadable(suggestedSource: SuggestedSource): Promise<boolean> {
	// the built-in web search names no address, so there is nothing to confirm
	if (suggestedSource.sourceKind === "search") {
		return true
	}

	try {
		await readSuggestedSource(suggestedSource)
		return true
	} catch (error) {
		console.log(`dropped an unreadable ${suggestedSource.sourceKind} suggestion: ${String(error)}`)
		return false
	}
}

// read the suggested source through the same helper its ingester uses, so a confirmed suggestion is one that will ingest
async function readSuggestedSource(suggestedSource: SuggestedSource): Promise<void> {
	// a subreddit is confirmed through the keyless feed the reddit ingester falls back to
	if (suggestedSource.sourceKind === "reddit") {
		const subreddit = suggestedSource.value.replace(/^r\//, "")
		await fetchFeed(`https://www.reddit.com/r/${subreddit}/.rss`, { userAgent: REDDIT_USER_AGENT })
		return
	}

	// a channel or playlist is confirmed through its Atom feed, which is the YouTube ingester's keyless path
	if (suggestedSource.sourceKind === "youtube") {
		await fetchFeed(toAtomUrl(suggestedSource.value), { resourceKind: "watch" })
		return
	}

	// a feed has to parse as a feed. a page that merely returns 200 is not a valid feed
	if (suggestedSource.sourceKind === "rss") {
		await fetchFeed(suggestedSource.value)
		return
	}

	// a page only has to answer. the scan reads its content later
	const response = await fetchPublicUrl(suggestedSource.value, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
	if (!response.ok) {
		throw new Error(`${suggestedSource.value} returned ${response.status}`)
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
