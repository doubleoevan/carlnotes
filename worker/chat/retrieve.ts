// the read side of topic chat. one question picks the topic's most similar findings
// and assembles the context a reply is written from
import { reportError } from "@shared/monitoring"
import { toSourceSummary } from "@shared/sources"
import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	attachments,
	chatAttachments,
	EMBED_MODEL_NAME,
	findings,
	resources,
	scans,
	sources,
	topics,
} from "../../db/schema"
import { embedVector } from "../models"
import { getResourceContent } from "../store"

// how many findings a chat turn sends to the model. the topic's finding set is already trimmed to its max-results.
// this is a top-ranked subset of those findings, reranked based on the question
const MAX_RETRIEVED_FINDINGS = 8

// how much of one resource's text a chat turn includes. enough to answer from, small enough that they fit in the prompt.
const MAX_RESOURCE_CHARS = 2000

// how many recent scan summaries a chat turn includes, newest first
const MAX_SCAN_SUMMARIES = 3

// how close two findings' question-similarity has to be before recency is used to break their tie. cosine distance
// runs 0 to 2, so the band is narrow: it only reorders findings that answer the question equally well.
// widen it to lean harder on recency, narrow it to lean harder on question-similarity
const SIMILARITY_TIE_BAND = 0.05

// qwen3 is instruction-aware, so the question is wrapped as the query side while stored resource vectors stay plain.
// the instruction describes a user's question, since that is what chat embeds
const EMBED_QUERY_INSTRUCTION = "Given a user's question about a topic, retrieve web resources that answer it"

// one finding as the model sees it: what it points at, when this topic found it, why the pipeline kept it,
// and the text behind it
export type RetrievedFinding = {
	title: string | null
	url: string
	foundAt: Date
	relevanceScore: number
	relevanceExplanation: string
	text: string
}

// everything one chat turn puts in front of the model, assembled from what the topic already holds
export type ChatContext = {
	topicName: string
	topicPrompt: string
	findings: RetrievedFinding[]
	// the places this topic reads, one display line each
	sources: string[]
	scanSummaries: string[]
	attachmentContext: string
	// this user's own kept chat attachments for this topic. scoped to the chat use
	chatAttachmentContext: string
}

/**
 * Assembles one chat turn's context from what the topic holds, or null when the topic does not exist.
 */
export async function retrieveChatContext(
	topicId: string,
	question: string,
	userId: string,
	isOwner: boolean,
	litellmApiKey?: string,
): Promise<ChatContext | null> {
	// a missing topic has nothing to chat about
	const [topic] = await db
		.select({ name: topics.name, prompt: topics.prompt })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return null
	}

	// re-rank the findings against the question, then read the sources, scan summaries, and attachment contexts.
	// the topic's own attachments are owner-only
	const retrievedFindings = await retrieveFindings(topicId, question, litellmApiKey)
	const [topicSources, scanSummaries, attachmentContext, chatAttachmentContext] = await Promise.all([
		readSources(topicId),
		readScanSummaries(topicId),
		isOwner ? readAttachmentContext(topicId) : Promise.resolve(""),
		readChatAttachmentContext(userId, topicId),
	])
	return {
		topicName: topic.name,
		topicPrompt: topic.prompt,
		findings: retrievedFindings,
		sources: topicSources,
		scanSummaries,
		attachmentContext,
		chatAttachmentContext,
	}
}

// the topic's findings ranked by how close their resource is to the question
async function retrieveFindings(
	topicId: string,
	question: string,
	litellmApiKey?: string,
): Promise<RetrievedFinding[]> {
	// embed the question through the same helper review uses, which truncates and normalizes it
	const questionVector = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${question}`, litellmApiKey)

	// order by cosine distance against the question, keeping only rows this model embedded.
	// the distance is also returned, so recency can break a tie between two findings that answer equally well
	const rows = await db
		.select({
			title: resources.title,
			url: resources.url,
			foundAt: findings.createdAt,
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
				eq(findings.topicId, topicId),
				isNotNull(resources.embedding),
				eq(resources.embeddingModel, EMBED_MODEL_NAME),
			),
		)
		.orderBy(sql`${resources.embedding} <=> ${JSON.stringify(questionVector)}::vector`)
		.limit(MAX_RETRIEVED_FINDINGS)

	// read each resource's stored text, falling back to its snippet
	return Promise.all(
		toRecencyOrdered(rows).map(async (row) => ({
			title: row.title,
			url: row.url,
			foundAt: row.foundAt,
			relevanceScore: row.relevanceScore,
			relevanceExplanation: row.relevanceExplanation,
			text: (await readResourceText(row.contentKey, row.snippet)).slice(0, MAX_RESOURCE_CHARS),
		})),
	)
}

/**
 * The retrieved rows with near-ties broken by recency, so the newer of two findings that answer the question equally well leads.
 * The set never changes, only its order.
 */
export function toRecencyOrdered<Row extends { distance: number; foundAt: Date }>(rows: Row[]): Row[] {
	// banding the distance makes this a real ordering. comparing each pair for closeness instead would not be
	// transitive, so three findings could sort into an order none of the pairwise answers asked for
	const toBand = (distance: number): number => Math.floor(distance / SIMILARITY_TIE_BAND)
	return [...rows].sort(
		(row, otherRow) =>
			toBand(row.distance) - toBand(otherRow.distance) || otherRow.foundAt.getTime() - row.foundAt.getTime(),
	)
}

// a resource's stored Markdown, falling back to its native snippet.
// an unreadable object is a cache miss and not a failure, so the snippet still gets returned
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

// the topic's ready sources, summarized the same way the topic page shows them.
// a source that has not passed its llm-guard screen is left out
async function readSources(topicId: string): Promise<string[]> {
	const sourceRows = await db
		.select({ sourceKind: sources.kind, config: sources.config })
		.from(sources)
		.where(and(eq(sources.topicId, topicId), eq(sources.status, "ready")))

	// the built-in web search stores nothing worth summarizing, so it names itself
	return sourceRows.map((sourceRow) => {
		if (sourceRow.sourceKind === "search") {
			return "web search — Carl searches the live web for this topic"
		}
		const summary = toSourceSummary(sourceRow.sourceKind, sourceRow.config)
		return summary ? `${sourceRow.sourceKind} — ${summary}` : sourceRow.sourceKind
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
				eq(chatAttachments.status, "ready"),
			),
		)

	// merge into one block, skipping the ones whose context came back empty
	return attachmentRows
		.map((attachmentRow) => attachmentRow.context)
		.filter((chatAttachmentContext) => chatAttachmentContext.trim().length > 0)
		.join("\n\n")
}
