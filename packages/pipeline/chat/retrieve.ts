// the read side of topic chat

import { toSourceSummary, toUrlHost } from "@carlnotes/contracts/sources"
import { db, isCurrentModelEmbedding, isFindingShown } from "@carlnotes/db"
import { chatAttachments } from "@carlnotes/db/schema/chat"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { attachments, sources, topics } from "@carlnotes/db/schema/topics"
import { getResourceContent } from "@carlnotes/db/store"
import { reportError } from "@carlnotes/server/monitoring"
import { and, desc, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm"
import { embedRetrievalQuery, readDocsBlock } from "./retrieveDocs"

// how many findings a chat turn sends to the model
const MAX_RETRIEVED_FINDINGS = 8

// how much of one resource's text a chat turn includes
const MAX_RESOURCE_CHARS = 2000

// how many recent scan summaries a chat turn includes, newest first
export const MAX_SCAN_SUMMARIES = 3

// how close two findings' question-similarity has to be before recency is used to break their tie
const SIMILARITY_TIE_RANGE = 0.05

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
	shouldIncludeAttachments = true,
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

	// embed the question once. the findings and the docs both rank against it
	const questionVector = await embedRetrievalQuery(question, litellmApiKey)

	// re-rank the findings against the question and read the sources, scan summaries, attachment contexts, and docs
	const [retrievedFindings, topicSources, scanSummaries, attachmentContext, chatAttachmentContext, docsBlock] =
		await Promise.all([
			retrieveFindings([topicId], questionVector),
			readSources(topicId),
			readScanSummaries(topicId),
			// read the topic's attachments for its owner and the user's kept chat attachments. a chat room turn reads no attachments
			isTopicOwner && shouldIncludeAttachments ? readAttachmentContext(topicId) : Promise.resolve(""),
			shouldIncludeAttachments ? readChatAttachmentContext(userId, topicId) : Promise.resolve(""),
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
	const queryVector = await embedRetrievalQuery(query, litellmApiKey)
	return rankTopicFindings([topicId], queryVector, limit)
}

/**
 * Returns the topics' findings ranked by how close their resource is to the question, each with its stored text.
 */
export async function retrieveFindings(
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

// the findings nearest the question among the resources this model embedded, near-ties broken by recency.
// the topics' findings are collected first and ranked second
async function rankTopicFindings(
	topicIds: string[],
	questionVector: number[],
	limit: number,
): Promise<RankedTopicFinding[]> {
	// run the ranking query and name each row's columns
	const { rows } = await db.execute<RankedTopicFindingRow>(toRankTopicFindingsQuery(topicIds, questionVector, limit))
	const rankedTopicFindings = rows.map(toRankedTopicFinding)

	// break near-ties by recency, then add each row's url host as its source
	return toRelevanceThenRecencyOrder(rankedTopicFindings).map((rankedRow) => ({
		...rankedRow,
		source: toUrlHost(rankedRow.url),
	}))
}

// one ranked row as the database returns it, by column name
type RankedTopicFindingRow = {
	// the finding and the topic it belongs to, and its resource
	finding_id: string
	topic_id: string
	title: string | null
	url: string
	resource_kind: string
	// when the topic found it and when the resource was published
	found_at: Date
	published_at: Date
	// the review, where the resource's text lives, and how close it is to the question
	relevance_score: number
	relevance_explanation: string
	snippet: string | null
	content_key: string | null
	distance: number
}

/**
 * Returns the ranking query: the topics' shown findings whose resources the current model embedded, collected in a
 * materialized common table expression and ordered by distance.
 */
export function toRankTopicFindingsQuery(topicIds: string[], questionVector: number[], limit: number): SQL {
	// the topics' findings, each with its distance from the question
	const questionVectorLiteral = JSON.stringify(questionVector)
	const topicFindingsQuery = db
		.select({
			findingId: sql`${findings.id}`.as("finding_id"),
			topicId: sql`${findings.topicId}`.as("topic_id"),
			title: sql`${resources.title}`.as("title"),
			url: sql`${resources.url}`.as("url"),
			resourceKind: sql`${resources.kind}`.as("resource_kind"),
			foundAt: sql`${findings.createdAt}`.as("found_at"),
			publishedAt: sql`${resources.createdAt}`.as("published_at"),
			relevanceScore: sql`${findings.relevanceScore}`.as("relevance_score"),
			relevanceExplanation: sql`${findings.relevanceExplanation}`.as("relevance_explanation"),
			snippet: sql`${resources.snippet}`.as("snippet"),
			contentKey: sql`${resources.contentKey}`.as("content_key"),
			distance: sql`${resources.embedding} <=> ${questionVectorLiteral}::vector`.as("distance"),
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(inArray(findings.topicId, topicIds), isFindingShown, isCurrentModelEmbedding))

	// the materialized topic findings, then the ranking over them
	return sql`with topic_findings as materialized (${topicFindingsQuery}) select * from topic_findings order by distance limit ${limit}`
}

// a ranked row with its columns named as the code names them
function toRankedTopicFinding(row: RankedTopicFindingRow): Omit<RankedTopicFinding, "source"> & { distance: number } {
	return {
		findingId: row.finding_id,
		topicId: row.topic_id,
		title: row.title,
		url: row.url,
		resourceKind: row.resource_kind,
		foundAt: new Date(row.found_at),
		publishedAt: new Date(row.published_at),
		relevanceScore: Number(row.relevance_score),
		relevanceExplanation: row.relevance_explanation,
		snippet: row.snippet,
		contentKey: row.content_key,
		distance: Number(row.distance),
	}
}

/**
 * Returns the same rows closest first, with near-ties broken by recency.
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

/**
 * Reads a Resource's stored Markdown, or its snippet if no content was stored or the read failed.
 */
export async function readResourceText(contentKey: string | null, snippet: string | null): Promise<string> {
	// a resource that was never offloaded has only its snippet
	if (!contentKey) {
		return snippet ?? ""
	}

	// read the object, falling back to the snippet if the object is gone or unreadable
	try {
		return await getResourceContent(contentKey)
	} catch (error) {
		// report the failure and return the snippet instead of the stored content
		console.error(`could not read stored content ${contentKey}`, error)
		reportError(error, "object-storage")
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
