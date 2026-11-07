// public Topic context and sender-private context stay separate throughout review
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { toSharedCommentLine } from "@carlnotes/contracts/socialText"
import type { PersonalSourcesContextVersion, PersonalSourcesReviewContext } from "@carlnotes/db/personalSourcesContext"
import type { SharedCommentText } from "@carlnotes/db/sharedComments"
import {
	type Budget,
	charge,
	EMBED_COST_PER_MILLION_TOKENS,
	toEstimatedTokens,
	tokenCost,
} from "@carlnotes/models/budget"
import { embedPrivateVectors, embedVector } from "@carlnotes/models/models"
import { type TopicScanContext, toTopicContextHash } from "../attach"
import { assertPersonalSourcesReviewCurrent, toPrivateReviewError } from "../personalSources/reviewContext"

// the bounded input to the relevance embedding
const MAX_EMBED_CHARS = 8000

// the topic context limit for the score prompt and the scan summary. the limit fits the prompt and one full-length
// attachment
const MAX_TOPIC_CONTEXT_CHARS = 24_000

// how many example pages of each kind the score prompt lists
const MAX_SCORE_EXAMPLE_PAGES = 10

// qwen3 is instruction-aware, so the query side is wrapped with this task instruction while documents stay plain
const EMBED_QUERY_INSTRUCTION = "Given a topic's interest description, retrieve web resources relevant to it"

// the topic's context. the hash covers all of the context, and the gate embeds the start of the context.
// the score text adds the pages that the topic's users liked, bookmarked, or rated down
export type TopicContext = {
	name: string
	text: string
	embedding: number[]
	contextHash: string
	scoreText: string
	// the private context of each sender, and the versions a private review checks are still current
	personalSourcesVersions?: PersonalSourcesContextVersion[]
	personalSources?: PersonalSourcesReviewContext[]
}

// a page from the topic's feed that the score prompt shows as an example
export type ScoreExamplePage = { title: string | null; url: string }

// the example pages. the pages that the topic's users liked or bookmarked, and the pages that they rated down
export type ScoreExamplePages = { likedOrBookmarkedPages: ScoreExamplePage[]; ratedDownPages: ScoreExamplePage[] }

/**
 * Builds the one context text a Scan reviews against: the topic's name, its prompt, and its attachments.
 */
export function toTopicContextText(topicScanContext: { name: string; context: string }): string {
	const { name, context } = topicScanContext
	return [name, context.trim()].filter(Boolean).join("\n\n").slice(0, MAX_TOPIC_CONTEXT_CHARS)
}

/**
 * Builds the score prompt's text from the context text, then the pages that the topic's users liked or bookmarked, then
 * the pages that they rated down, then the comments the topic's editors shared with the podcast. No other comment is
 * read.
 */
export function toScoreContextText(
	contextText: string,
	scoreExamplePages: ScoreExamplePages,
	sharedCommentTexts: SharedCommentText[] = [],
): string {
	// list each kind of example page by title and host, under a label like an attachment's. a kind with no pages is left
	// out
	const toExampleSections = (label: string, examplePages: ScoreExamplePage[]): string[] => {
		const examplePageLines = examplePages
			.slice(0, MAX_SCORE_EXAMPLE_PAGES)
			.map(({ title, url }) => `- ${title ?? url} (${toHostWithoutWww(url)})`)
		return examplePageLines.length > 0 ? [`[${label}]\n${examplePageLines.join("\n")}`] : []
	}
	return [
		contextText,
		...toExampleSections("pages the reader liked or bookmarked", scoreExamplePages.likedOrBookmarkedPages),
		...toExampleSections("pages the reader rated down", scoreExamplePages.ratedDownPages),
		...toSharedCommentSections(sharedCommentTexts),
	].join("\n\n")
}

// the shared comments under their own label, one line each with its author's name. no shared comment, no section
function toSharedCommentSections(sharedCommentTexts: SharedCommentText[]): string[] {
	const sharedCommentLines = sharedCommentTexts.map(
		(sharedCommentText) => `- ${toSharedCommentLine(sharedCommentText)}`,
	)
	return sharedCommentLines.length > 0
		? [`[what people said about this topic, shared by its editors]\n${sharedCommentLines.join("\n")}`]
		: []
}

// the topic's scan context, the example pages and the shared comments for the score prompt, the Scan's Budget,
// and the key that the embedding bills
type LoadTopicContextOptions = {
	shouldEmbed?: boolean
	topicScanContext: TopicScanContext
	scoreExamplePages: ScoreExamplePages
	sharedCommentTexts?: SharedCommentText[]
	budget: Budget
	litellmApiKey?: string
}

/**
 * Embeds the start of the topic's context for the relevance gate: its name, its prompt, and its attachments' contexts.
 * The text that the score prompt reads also lists the example pages.
 */
export async function loadTopicContext({
	topicScanContext,
	scoreExamplePages,
	sharedCommentTexts,
	budget,
	litellmApiKey,
	shouldEmbed = true,
}: LoadTopicContextOptions): Promise<TopicContext> {
	// always include the topic name in the scan context
	const text = toTopicContextText(topicScanContext)

	// preserve both public and private context within the relevance input budget
	const contextTextToEmbed = (topicScanContext.embeddingContext ?? text).slice(0, MAX_EMBED_CHARS)
	const embedding = shouldEmbed
		? await embedReviewContext({
				text: contextTextToEmbed,
				personalSourcesVersions: topicScanContext.personalSourcesVersions,
				litellmApiKey,
			})
		: []
	if (shouldEmbed) {
		charge(budget, "embedding", tokenCost(toEstimatedTokens(contextTextToEmbed.length), EMBED_COST_PER_MILLION_TOKENS))
	}
	return {
		name: topicScanContext.name,
		text,
		embedding,
		contextHash: toReviewContextHash(topicScanContext),
		scoreText: toScoreContextText(text, scoreExamplePages, sharedCommentTexts),
		personalSources: topicScanContext.personalSources,
		personalSourcesVersions: topicScanContext.personalSourcesVersions,
	}
}

// private vectors remain local to this review and use content-redacted model options
async function embedReviewContext({
	text,
	personalSourcesVersions,
	litellmApiKey,
}: {
	text: string
	personalSourcesVersions?: PersonalSourcesContextVersion[]
	litellmApiKey?: string
}): Promise<number[]> {
	// a context with no private text embeds as any query does
	if (!personalSourcesVersions) {
		return embedQuery(text, litellmApiKey)
	}

	// a private context embeds on its owner's key, and only while its versions are current
	try {
		await assertPersonalSourcesReviewCurrent(personalSourcesVersions)
		if (!litellmApiKey) {
			throw new Error("Private review requires the owner's key")
		}

		// one private vector for the context as a query
		const [vector] = await embedPrivateVectors([`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${text}`], litellmApiKey)
		if (!vector) {
			throw new Error("Private review embedding missing")
		}
		return vector
	} catch (error) {
		// a private review's failure is reported with nothing of the private text
		throw toPrivateReviewError(error)
	}
}

/**
 * Embed a query: the topic context wrapped in qwen3's Instruct and Query template, through the truncating helper.
 */
export async function embedQuery(text: string, litellmApiKey?: string): Promise<number[]> {
	return embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${text}`, litellmApiKey)
}

/**
 * Keeps review selection and persistence on the same public-and-private context version.
 */
export function toReviewContextHash(context: TopicScanContext): string {
	const text = toTopicContextText(context)
	return toTopicContextHash(context.personalSources?.length ? JSON.stringify([text, context.personalSources]) : text)
}
