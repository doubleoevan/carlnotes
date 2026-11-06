// transient content matching is shared by the Topic picker and manual email filing
import type { SuggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { SuggestedTopic } from "@carlnotes/contracts/topicSuggestions"
import { db } from "@carlnotes/db"
import { EMBED_DIMENSIONS } from "@carlnotes/db/schema/scans"
import { teams } from "@carlnotes/db/schema/teams"
import { attachments, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { toEditableTopicFilter } from "@carlnotes/db/topicPermissions"
import { embedPrivateVectors } from "@carlnotes/models/models"
import { appUrl } from "@carlnotes/server/appUrl"
import { cosineSimilarity } from "ai"
import { and, eq, gt, ilike, inArray, sql } from "drizzle-orm"
import {
	MIN_SUGGESTED_TOPIC_RELEVANCE,
	TOPIC_MATCH_TEXT_CHARS,
	toTopicNameAndPromptText,
	toTopicRelevance,
} from "./topicRelevance"

// bound each read and embedding call without cutting off later eligible destinations
const TOPIC_MATCH_BATCH_SIZE = 64
const TOPIC_MATCH_PAGE_SIZE = 21
export type MatchedTopic = SuggestedTopic & { group: "editable" }

type TopicMatchCandidate = {
	id: string
	name: string
	prompt: string
	context: string
	// the Topic details that a match returns
	visibility: SuggestedTopic["visibility"]
	teamName: string | null
	subscriberCount: number
}
// a scored candidate, and the result of a match
type CandidateMatch = { candidate: TopicMatchCandidate; relevance: number }
type TopicMatches = { status: "matched"; topics: MatchedTopic[]; totalCount: number } | { status: "unavailable" }
type MatchTopicsOptions = {
	userId: string
	payload: SuggestTopicsPayload
	includeAllEditableTopics?: boolean
	// the page to return, the name hints, and the minimum relevance
	offset?: number
	limit?: number | null
	topicNameHints?: string[]
	minimumRelevance?: number
}

/**
 * Ranks current Topic descriptions without storing input, vectors, drafts, or accepted-send charges.
 */
export async function matchPersonalSourcesTopics(options: MatchTopicsOptions): Promise<TopicMatches> {
	try {
		// avoid keys and paid work when the eligible catalog is empty
		const firstPage = await loadCandidatePage(options)
		if (!firstPage.length) {
			return { status: "matched", topics: [], totalCount: 0 }
		}
		const [owner] = await db.select({ key: users.litellmVirtualKey }).from(users).where(eq(users.id, options.userId))
		if (!owner?.key) {
			return { status: "unavailable" }
		}

		// include later email sections instead of silently truncating the routing content
		const queryTexts = toContentChunks(options.payload)
		const queryVectors = await embedMatchingTexts(queryTexts, owner.key)
		const matches = await matchCandidatePages({ options, firstPage, queryTexts, queryVectors, key: owner.key })
		const currentMatches = await recheckMatchedTopics(options, matches)
		return currentMatches ? toMatchedPage(options, currentMatches) : { status: "unavailable" }
	} catch {
		// provider and database errors may contain private input; never return or log them
		return { status: "unavailable" }
	}
}

// compare every candidate batch with the same stable content vectors
async function matchCandidatePages({
	options,
	firstPage,
	queryTexts,
	queryVectors,
	key,
}: {
	options: MatchTopicsOptions
	firstPage: TopicMatchCandidate[]
	queryTexts: string[]
	queryVectors: number[][]
	key: string
}): Promise<CandidateMatch[]> {
	// score candidate pages until a short page ends the catalog
	const matches: CandidateMatch[] = []
	let candidatePage = firstPage
	while (candidatePage.length) {
		// identical texts within a batch share one embedding, and an exact content match reuses its query vector
		const vectorsByText = new Map(queryTexts.map((text, index) => [text, queryVectors[index] ?? []]))
		const candidateTexts = [...new Set(candidatePage.flatMap(toCandidateTexts))].filter(
			(text) => !vectorsByText.has(text),
		)
		const candidateVectors = await embedMatchingTexts(candidateTexts, key)
		for (const [index, text] of candidateTexts.entries()) {
			vectorsByText.set(text, candidateVectors[index] ?? [])
		}
		for (const candidate of candidatePage) {
			const contentRelevance = toContentRelevance(candidate, queryVectors, vectorsByText)
			const relevance = Math.max(
				0,
				Math.min(1, contentRelevance + toNameBoost(candidate.name, options.topicNameHints ?? [])),
			)
			if (
				options.includeAllEditableTopics ||
				isRelevantTopic({ contentRelevance, relevance, minimumRelevance: options.minimumRelevance })
			) {
				matches.push({ candidate, relevance })
			}
		}
		// stop at a short page, or read the next page
		if (candidatePage.length < TOPIC_MATCH_BATCH_SIZE) {
			break
		}
		candidatePage = await loadCandidatePage(options, { afterId: candidatePage.at(-1)?.id })
	}
	return matches
}

// a Topic's name and prompt lead its score, and its attachment context can only raise it
function toContentRelevance(
	candidate: TopicMatchCandidate,
	queryVectors: number[][],
	vectorsByText: Map<string, number[]>,
): number {
	const toContentScore = (text: string): number =>
		Math.max(...queryVectors.map((queryVector) => cosineSimilarity(queryVector, vectorsByText.get(text) ?? [])))
	return toTopicRelevance({
		nameAndPromptScore: toContentScore(toTopicNameAndPromptText(candidate)),
		attachmentScore: candidate.context ? toContentScore(candidate.context) : null,
	})
}

// recheck edit authority and the context used for matching before exposing destinations
async function recheckMatchedTopics(
	options: MatchTopicsOptions,
	matches: CandidateMatch[],
): Promise<CandidateMatch[] | null> {
	const currentMatches: CandidateMatch[] = []
	for (let offset = 0; offset < matches.length; offset += TOPIC_MATCH_BATCH_SIZE) {
		const batch = matches.slice(offset, offset + TOPIC_MATCH_BATCH_SIZE)
		const matchedById = new Map(batch.map((match) => [match.candidate.id, match]))
		const currentTopics = await loadCandidatePage(options, { topicIds: [...matchedById.keys()] })
		for (const candidate of currentTopics) {
			const match = matchedById.get(candidate.id)
			// a changed description fails the whole recheck
			if (!match || !isSameDescription(candidate, match.candidate)) {
				return null
			}
			currentMatches.push({ candidate, relevance: match.relevance })
		}
	}
	return currentMatches
}

// order the complete authorized ranking before marking best matches and slicing the existing offset cursor
function toMatchedPage(options: MatchTopicsOptions, matches: CandidateMatch[]): TopicMatches {
	matches.sort((left, right) => right.relevance - left.relevance || left.candidate.id.localeCompare(right.candidate.id))
	const bestScore = matches[0]?.relevance ?? 1
	const offset = options.offset ?? 0
	const limit = options.limit === undefined ? TOPIC_MATCH_PAGE_SIZE : options.limit
	const rankedTopics = matches.map(
		({ candidate, relevance }, index): MatchedTopic => ({
			id: candidate.id,
			name: candidate.name,
			prompt: candidate.prompt.slice(0, 300),
			url: new URL(toTopicPath(candidate), appUrl()).href,
			group: "editable",
			relevance,
			visibility: candidate.visibility,
			teamName: candidate.teamName,
			subscriberCount: candidate.subscriberCount,
			isBestMatch: index < 3 && relevance > MIN_SUGGESTED_TOPIC_RELEVANCE && relevance >= bestScore - 0.02,
		}),
	)
	return {
		status: "matched",
		totalCount: rankedTopics.length,
		topics: rankedTopics.slice(offset, limit === null ? undefined : offset + limit),
	}
}

// read ready Topic attachment context only, never another sender's private Personal sources
async function loadCandidatePage(
	{ userId, payload }: MatchTopicsOptions,
	{ afterId, topicIds }: { afterId?: string; topicIds?: string[] } = {},
): Promise<TopicMatchCandidate[]> {
	// every page and the final recheck require current edit permission and a literal name match
	const search = payload.query ? ilike(topics.name, `%${payload.query.replace(/[\\%_]/g, "\\$&")}%`) : undefined
	return db
		.select({
			id: topics.id,
			name: topics.name,
			prompt: topics.prompt,
			context: sql<string>`left(coalesce((select string_agg(left(${attachments.context}, ${TOPIC_MATCH_TEXT_CHARS}), E'\\n' order by ${attachments.filename}, ${attachments.id}) from ${attachments} where ${attachments.topicId} = ${topics.id} and ${attachments.status} = 'ready'), ''), ${TOPIC_MATCH_TEXT_CHARS})`,
			visibility: topics.visibility,
			teamName: teams.name,
			subscriberCount: topics.subscriberCount,
		})
		.from(topics)
		.leftJoin(teams, eq(teams.id, topics.teamId))
		.where(
			and(
				toEditableTopicFilter(userId),
				search,
				afterId ? gt(topics.id, afterId) : undefined,
				topicIds ? inArray(topics.id, topicIds) : undefined,
			),
		)
		.orderBy(topics.id)
		.limit(TOPIC_MATCH_BATCH_SIZE)
}

// bound provider payloads and reject incomplete vectors before accepting any partial ranking
async function embedMatchingTexts(texts: string[], key: string): Promise<number[][]> {
	const vectors: number[][] = []
	for (let offset = 0; offset < texts.length; offset += TOPIC_MATCH_BATCH_SIZE) {
		const batch = texts.slice(offset, offset + TOPIC_MATCH_BATCH_SIZE)
		const embeddings = await embedPrivateVectors(batch, key)
		// a short batch or an unusable vector fails the whole embedding
		if (embeddings.length !== batch.length || embeddings.some((vector) => !isUsableVector(vector))) {
			throw new Error("Topic matching requires complete embeddings")
		}
		vectors.push(...embeddings)
	}
	return vectors
}

// include each retained email section and link, with stable boundaries across cursor requests
function toContentChunks(payload: SuggestTopicsPayload): string[] {
	const content = [payload.title, payload.summary, ...payload.links].join("\n")
	const chunks: string[] = []
	for (let offset = 0; offset < content.length; offset += TOPIC_MATCH_TEXT_CHARS) {
		chunks.push(content.slice(offset, offset + TOPIC_MATCH_TEXT_CHARS))
	}
	return chunks.length ? chunks : ["Email"]
}

// the texts that score one candidate. only a Topic with attachment context costs a second embedding
function toCandidateTexts(candidate: TopicMatchCandidate): string[] {
	const nameAndPromptText = toTopicNameAndPromptText(candidate)
	return candidate.context ? [nameAndPromptText, candidate.context] : [nameAndPromptText]
}

// a match stands only while its name, prompt, and attachment context still read as they did when it was scored
function isSameDescription(left: TopicMatchCandidate, right: TopicMatchCandidate): boolean {
	return toTopicNameAndPromptText(left) === toTopicNameAndPromptText(right) && left.context === right.context
}

// a hint only boosts content that already clears the minimum suggested relevance
function toNameBoost(name: string, hints: string[]): number {
	return 0.1 * Math.max(0, ...hints.map((hint) => toTopicNameSimilarity({ name, hint })))
}

/**
 * Compares a Topic name with a written hint using the shared Unicode trigram matcher.
 */
export function toTopicNameSimilarity({ name, hint }: { name: string; hint: string }): number {
	// normalize punctuation and case before comparing full names and matching word windows
	const normalize = (text: string): string =>
		text
			.normalize("NFKC")
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, " ")
			.trim()
	// an empty hint has no similarity
	const normalizedName = normalize(name)
	const normalizedHint = normalize(hint)
	if (!normalizedHint) {
		return 0
	}
	// compare the hint with the full name and with each word window of the hint's length
	const words = normalizedName.split(" ")
	const wordCount = normalizedHint.split(" ").length
	let similarity = toTrigramSimilarity(normalizedHint, normalizedName)
	for (let offset = 0; offset <= words.length - wordCount; offset += 1) {
		similarity = Math.max(
			similarity,
			toTrigramSimilarity(normalizedHint, words.slice(offset, offset + wordCount).join(" ")),
		)
	}
	return similarity
}

// compare Unicode character trigrams without sending email hints to SQL or telemetry
function toTrigramSimilarity(left: string, right: string): number {
	const toTrigrams = (text: string): Set<string> => {
		const characters = [...`  ${text} `]
		return new Set(characters.slice(0, -2).map((_, index) => characters.slice(index, index + 3).join("")))
	}
	// return the share of trigrams that the left and right texts have in common
	const leftTrigrams = toTrigrams(left)
	const rightTrigrams = toTrigrams(right)
	const sharedCount = [...leftTrigrams].filter((trigram) => rightTrigrams.has(trigram)).length
	return (2 * sharedCount) / (leftTrigrams.size + rightTrigrams.size)
}

// fail closed when a provider returns the wrong dimension or a non-finite vector
function isUsableVector(vector: number[]): boolean {
	return (
		vector.length === EMBED_DIMENSIONS && vector.every(Number.isFinite) && vector.some((coordinate) => coordinate !== 0)
	)
}

// email suggestions require a content match before name hints can raise their score
function isRelevantTopic({
	contentRelevance,
	relevance,
	minimumRelevance = MIN_SUGGESTED_TOPIC_RELEVANCE,
}: {
	contentRelevance: number
	relevance: number
	minimumRelevance?: number
}): boolean {
	return contentRelevance > MIN_SUGGESTED_TOPIC_RELEVANCE && relevance >= minimumRelevance
}
