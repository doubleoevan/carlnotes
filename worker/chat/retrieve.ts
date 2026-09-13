// the read side of topic chat
import { reportError } from "@shared/monitoring"
import { toSourceSummary, toUrlHost } from "@shared/sources"
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	attachments,
	chatAttachments,
	docsChunks,
	EMBED_MODEL_NAME,
	findings,
	resources,
	scans,
	sources,
	teams,
	teamTopics,
	topics,
} from "../../db/schema"
import { embedVector } from "../models"
import { getResourceContent } from "../store"

// how many findings a chat turn sends to the model
const MAX_RETRIEVED_FINDINGS = 8

// how much of one resource's text a chat turn includes
const MAX_RESOURCE_CHARS = 2000

// how many recent scan summaries a chat turn includes, newest first
const MAX_SCAN_SUMMARIES = 3

// how close two findings' question-similarity has to be before recency is used to break their tie
const SIMILARITY_TIE_RANGE = 0.05

// qwen3 is instruction-aware
const EMBED_QUERY_INSTRUCTION = "Given a user's question about a topic, retrieve web resources that answer it"

// how many docs sections one chat turn may quote and how relevant they have to be
const MAX_RETRIEVED_DOCS_SECTIONS = 3
const DOCS_MATCH_MAX_DISTANCE = 0.5

// one finding as the model sees it
export type RetrievedFinding = {
	title: string | null
	url: string
	foundAt: Date
	relevanceScore: number
	relevanceExplanation: string
	text: string
	// the topic the finding belongs to, set on a team chat turn whose findings span topics
	topicName?: string
}

// the settings a topic is scanned and shown with, so the chat can know and edit them
export type TopicSettings = Pick<
	typeof topics.$inferSelect,
	"frequency" | "scheduledTime" | "scheduledDayOfWeek" | "visibility" | "tags" | "maxTopicFindings"
>

// everything one chat turn puts in front of the model, assembled from what the topic already holds
export type ChatContext = {
	topicName: string
	topicPrompt: string
	topicSettings: TopicSettings
	findings: RetrievedFinding[]
	// the places this topic reads, one display line each
	sources: string[]
	scanSummaries: string[]
	attachmentContext: string
	// this user's own kept chat attachments for this topic. scoped to the chat use
	chatAttachmentContext: string
	// the docs sections close enough to the question to quote, empty for an ordinary topic question
	docsBlock: string
}

/**
 * Assembles one chat turn's context from what the topic holds, or null if the topic does not exist.
 */
export async function retrieveChatContext(
	topicId: string,
	question: string,
	userId: string,
	isTopicOwner: boolean,
	litellmApiKey?: string,
	includeKeptAttachments = true,
): Promise<ChatContext | null> {
	// a missing topic has nothing to chat about
	const [topic] = await db
		.select({
			name: topics.name,
			prompt: topics.prompt,
			frequency: topics.frequency,
			scheduledTime: topics.scheduledTime,
			scheduledDayOfWeek: topics.scheduledDayOfWeek,
			visibility: topics.visibility,
			tags: topics.tags,
			maxTopicFindings: topics.maxTopicFindings,
		})
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return null
	}

	// embed the question once through the same helper review uses. the findings and the docs both rank against it
	const questionVector = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${question}`, litellmApiKey)

	// re-rank the findings against the question, then read the sources, scan summaries, attachment contexts
	const retrievedFindings = await retrieveFindings([topicId], questionVector)
	const [topicSources, scanSummaries, attachmentContext, chatAttachmentContext, docsBlock] = await Promise.all([
		readSources(topicId),
		readScanSummaries(topicId),
		// a chat room turn's answer posts publicly, so the owner's attachments and the poster's kept chat attachments both stay out
		isTopicOwner && includeKeptAttachments ? readAttachmentContext(topicId) : Promise.resolve(""),
		includeKeptAttachments ? readChatAttachmentContext(userId, topicId) : Promise.resolve(""),
		readDocsBlock(questionVector),
	])
	// the name and prompt fill their own lines, and the rest of the row is the settings block
	const { name, prompt, ...topicSettings } = topic
	return {
		topicName: name,
		topicPrompt: prompt,
		topicSettings,
		findings: retrievedFindings,
		sources: topicSources,
		scanSummaries,
		attachmentContext,
		chatAttachmentContext,
		docsBlock,
	}
}

// one topic finding as rankTopicFindings returns it
export type RankedTopicFinding = {
	// the finding and the topic it belongs to
	findingId: string
	topicId: string
	// its resource, and the url's host as its source
	title: string | null
	url: string
	source: string | null
	resourceKind: string
	// when the topic found it and when the resource was published
	foundAt: Date
	publishedAt: Date
	// the review, where the resource's text lives, and how close it is to the query
	relevanceScore: number
	relevanceExplanation: string
	snippet: string | null
	contentKey: string | null
	distance: number
}

/**
 * Ranks a topic's findings closest to a query over the same embedding index and instruction chat retrieval uses, with
 * no resource text read.
 */
export async function searchTopicFindings(
	topicId: string,
	query: string,
	limit: number,
	litellmApiKey?: string,
): Promise<RankedTopicFinding[]> {
	const queryVector = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${query}`, litellmApiKey)
	return rankTopicFindings([topicId], queryVector, limit)
}

// the topics' findings ranked by how close their resource is to the question, each with its stored text
async function retrieveFindings(
	topicIds: string[],
	questionVector: number[],
	topicNameById?: Map<string, string>,
): Promise<RetrievedFinding[]> {
	// rank the findings, then read each resource's text
	const rankedTopicFindings = await rankTopicFindings(topicIds, questionVector, MAX_RETRIEVED_FINDINGS)
	return Promise.all(
		rankedTopicFindings.map(async (rankedRow) => ({
			title: rankedRow.title,
			url: rankedRow.url,
			foundAt: rankedRow.foundAt,
			relevanceScore: rankedRow.relevanceScore,
			relevanceExplanation: rankedRow.relevanceExplanation,
			text: (await readResourceText(rankedRow.contentKey, rankedRow.snippet)).slice(0, MAX_RESOURCE_CHARS),
			topicName: topicNameById?.get(rankedRow.topicId),
		})),
	)
}

// the findings nearest the question among the resources this model embedded, near-ties broken by recency
async function rankTopicFindings(
	topicIds: string[],
	questionVector: number[],
	limit: number,
): Promise<RankedTopicFinding[]> {
	const rows = await db
		.select({
			findingId: findings.id,
			topicId: findings.topicId,
			title: resources.title,
			url: resources.url,
			resourceKind: resources.kind,
			foundAt: findings.createdAt,
			publishedAt: resources.createdAt,
			relevanceScore: findings.relevanceScore,
			relevanceExplanation: findings.relevanceExplanation,
			snippet: resources.snippet,
			contentKey: resources.contentKey,
			distance: sql<number>`${resources.embedding} <=> ${JSON.stringify(questionVector)}::vector`,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(
			and(
				inArray(findings.topicId, topicIds),
				isNotNull(resources.embedding),
				eq(resources.embeddingModel, EMBED_MODEL_NAME),
			),
		)
		.orderBy(sql`${resources.embedding} <=> ${JSON.stringify(questionVector)}::vector`)
		.limit(limit)

	// break near-ties by recency, then add each row's url host as its source
	return toRelevanceThenRecencyOrder(rows).map((rankedRow) => ({ ...rankedRow, source: toUrlHost(rankedRow.url) }))
}

// the docs sections close enough to the question to quote, composed into one block
async function readDocsBlock(questionVector: number[]): Promise<string> {
	// keep only the sections within the cutoff, closest first, and limit how many one chat turn quotes
	const rows = await db
		.select({ page: docsChunks.page, content: docsChunks.content })
		.from(docsChunks)
		.where(
			and(
				eq(docsChunks.embeddingModel, EMBED_MODEL_NAME),
				sql`${docsChunks.embedding} <=> ${JSON.stringify(questionVector)}::vector < ${DOCS_MATCH_MAX_DISTANCE}`,
			),
		)
		.orderBy(sql`${docsChunks.embedding} <=> ${JSON.stringify(questionVector)}::vector`)
		.limit(MAX_RETRIEVED_DOCS_SECTIONS)

	// label each section with the docs url it came from, so a reply can point the user at the page
	return rows
		.map((docsRow) => `[carlnotes.com/docs${docsRow.page === "index" ? "" : `/${docsRow.page}`}]\n${docsRow.content}`)
		.join("\n\n")
}

/**
 * The retrieved rows with near-ties broken by recency, so the newer of two findings that answer the question equally well leads.
 * The set never changes, only its order.
 */
export function toRelevanceThenRecencyOrder<Row extends { distance: number; foundAt: Date }>(rows: Row[]): Row[] {
	// distances in one range count as a tie, so recency can decide between them
	const toSimilarityRange = (distance: number): number => Math.floor(distance / SIMILARITY_TIE_RANGE)
	return [...rows].sort(
		(row, otherRow) =>
			toSimilarityRange(row.distance) - toSimilarityRange(otherRow.distance) ||
			otherRow.foundAt.getTime() - row.foundAt.getTime(),
	)
}

// a resource's stored Markdown, falling back to its native snippet
async function readResourceText(contentKey: string | null, snippet: string | null): Promise<string> {
	// a resource that was never offloaded has only its snippet
	if (!contentKey) {
		return snippet ?? ""
	}

	// read the object, falling back to the snippet when it is gone or unreadable
	try {
		return await getResourceContent(contentKey)
	} catch (error) {
		// the chat turn still falls back to the snippet, so the failure is only reported
		console.error(`chat could not read stored content ${contentKey}`, error)
		reportError(error, "chat")
		return snippet ?? ""
	}
}

// the topic's ready sources, summarized the same way the topic page shows them
async function readSources(topicId: string): Promise<string[]> {
	const topicSourceRows = await db
		.select({ id: sources.id, sourceKind: sources.kind, config: sources.config })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), eq(sources.status, "ready")))

	// the built-in web search stores nothing worth summarizing, so it names itself
	return topicSourceRows.map((topicSourceRow) => {
		const summary = toSourceSummary(topicSourceRow.sourceKind, topicSourceRow.config)
		const label =
			topicSourceRow.sourceKind === "search"
				? "web search — Carl searches the live web for this topic"
				: summary
					? `${topicSourceRow.sourceKind} — ${summary}`
					: topicSourceRow.sourceKind
		// end the line with the source id the removeSource tool takes
		return `${label} [source ${topicSourceRow.id}]`
	})
}

// the topic's most recent scan summaries, newest first, skipping scans that didn't write one
async function readScanSummaries(topicId: string): Promise<string[]> {
	const summaryRows = await db
		.select({ scanSummary: scans.scanSummary })
		.from(scans)
		.where(and(eq(scans.topicId, topicId), isNotNull(scans.scanSummary)))
		.orderBy(desc(scans.startedAt))
		.limit(MAX_SCAN_SUMMARIES)

	// drop the empty summaries so a blank summary adds no noise
	return summaryRows.map((summaryRow) => summaryRow.scanSummary ?? "").filter((summary) => summary.length > 0)
}

// every topic attachment's generated context, merged and scoped to the topic owner
async function readAttachmentContext(topicId: string): Promise<string> {
	const attachmentRows = await db
		.select({ context: attachments.context })
		.from(attachments)
		.where(and(eq(attachments.topicId, topicId), eq(attachments.status, "ready")))

	// merge into one block, skipping attachments whose context came back empty
	return attachmentRows
		.map((attachmentRow) => attachmentRow.context)
		.filter((attachmentContext) => attachmentContext.trim().length > 0)
		.join("\n\n")
}

// every chat attachment the chat user kept for this topic, merged and scoped to the chat user
async function readChatAttachmentContext(userId: string, topicId: string): Promise<string> {
	const attachmentRows = await db
		.select({ context: chatAttachments.context })
		.from(chatAttachments)
		.where(
			and(
				eq(chatAttachments.userId, userId),
				eq(chatAttachments.topicId, topicId),
				eq(chatAttachments.isKept, true),
				eq(chatAttachments.status, "ready"),
			),
		)

	// merge into one block, skipping the ones whose context came back empty
	return attachmentRows
		.map((attachmentRow) => attachmentRow.context)
		.filter((chatAttachmentContext) => chatAttachmentContext.trim().length > 0)
		.join("\n\n")
}

// everything one team chat room turn puts in front of the model, drawn from every topic the team holds
export type TeamChatContext = {
	teamName: string
	// each held topic's name and prompt, for the prompt's topics block
	topics: { name: string; prompt: string }[]
	findings: RetrievedFinding[]
	// the held topics' sources, each line naming its topic
	sources: string[]
	scanSummaries: string[]
	docsBlock: string
}

/**
 * Builds the docs block alone for the new-topic chat, which has no topic material to read.
 */
export async function retrieveDocsBlock(question: string, litellmApiKey?: string): Promise<string> {
	const questionVector = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${question}`, litellmApiKey)
	return readDocsBlock(questionVector)
}

/**
 * Assembles one team chat room turn's context from every topic the team holds, or null if the team does not exist.
 * Owner attachments and kept chat material stay out of an answer that posts to the whole chat room.
 */
export async function retrieveTeamChatContext(
	teamId: string,
	question: string,
	litellmApiKey?: string,
): Promise<TeamChatContext | null> {
	// a missing team has nothing to chat about
	const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return null
	}

	// the team's owned topics
	const ownedTopicRows = await db
		.select({ id: topics.id, name: topics.name, prompt: topics.prompt })
		.from(topics)
		.where(eq(topics.teamId, teamId))
	// the team's shared topics
	const sharedTopicRows = await db
		.select({ id: topics.id, name: topics.name, prompt: topics.prompt })
		.from(teamTopics)
		.innerJoin(topics, eq(topics.id, teamTopics.topicId))
		.where(eq(teamTopics.teamId, teamId))
	// the topicIds list that drives the topic reads. the topicNameByTopicId map labels each finding and source line
	const teamTopicRows = [...ownedTopicRows, ...sharedTopicRows]
	const topicIds = teamTopicRows.map((topicRow) => topicRow.id)
	const topicNameByTopicId = new Map(teamTopicRows.map((topicRow) => [topicRow.id, topicRow.name]))

	// embed the question once, then rank every held topic's findings against it together
	const questionVector = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${question}`, litellmApiKey)
	const [retrievedFindings, teamSources, scanSummaries, docsBlock] = await Promise.all([
		topicIds.length > 0 ? retrieveFindings(topicIds, questionVector, topicNameByTopicId) : Promise.resolve([]),
		topicIds.length > 0 ? readTeamSources(topicIds, topicNameByTopicId) : Promise.resolve([]),
		topicIds.length > 0 ? readTeamScanSummaries(topicIds) : Promise.resolve([]),
		readDocsBlock(questionVector),
	])
	return {
		teamName: team.name,
		topics: teamTopicRows.map((topicRow) => ({ name: topicRow.name, prompt: topicRow.prompt })),
		findings: retrievedFindings,
		sources: teamSources,
		scanSummaries,
		docsBlock,
	}
}

// every topic's ready sources in one query, each line prefixed with its topic's name
async function readTeamSources(topicIds: string[], topicNameById: Map<string, string>): Promise<string[]> {
	const topicSourceRows = await db
		.select({ topicId: sources.topicId, sourceKind: sources.kind, config: sources.config })
		.from(sources)
		.where(and(inArray(sources.topicId, topicIds), eq(sources.status, "ready")))

	// the built-in web search stores nothing worth summarizing, so it names itself
	return topicSourceRows.map((topicSourceRow) => {
		const topicName = topicNameById.get(topicSourceRow.topicId) ?? "a topic"
		if (topicSourceRow.sourceKind === "search") {
			return `${topicName}: web search — Carl searches the live web for this topic`
		}
		// every other source keeps the topic page's own summary line
		const sourceSummary = toSourceSummary(topicSourceRow.sourceKind, topicSourceRow.config)
		return `${topicName}: ${sourceSummary ? `${topicSourceRow.sourceKind} — ${sourceSummary}` : topicSourceRow.sourceKind}`
	})
}

// the held topics' most recent scan summaries together, newest first
async function readTeamScanSummaries(topicIds: string[]): Promise<string[]> {
	const summaryRows = await db
		.select({ scanSummary: scans.scanSummary })
		.from(scans)
		.where(and(inArray(scans.topicId, topicIds), isNotNull(scans.scanSummary)))
		.orderBy(desc(scans.startedAt))
		.limit(MAX_SCAN_SUMMARIES)

	// drop the empty summaries so a blank summary adds no noise
	return summaryRows.map((summaryRow) => summaryRow.scanSummary ?? "").filter((summary) => summary.length > 0)
}
