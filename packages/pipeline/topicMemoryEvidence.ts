// selects the public Findings and existing Topic Memories used to update topic memories

import { toUtcDay } from "@carlnotes/contracts/time"
import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import {
	TOPIC_MEMORY_FACT_FORMAT_VERSION,
	TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT,
	TOPIC_MEMORY_NEIGHBOR_LIMIT,
} from "@carlnotes/contracts/topicMemoryWork"
import { type DbHandle, db, isFindingShown } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories } from "@carlnotes/db/schema/topicMemories"
import { getResourceContent } from "@carlnotes/db/store"
import {
	type TopicMemoryPromptFeedback,
	topicMemoryGroupingColumns,
	topicMemoryPromptFeedback,
} from "@carlnotes/db/topicMemories"
import { groupTopicMemories } from "@carlnotes/db/topicMemoryGroups"
import { and, cosineDistance, desc, eq, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm"
import { toExternalTopicMemorySourceFilter } from "./review/ownTopicPages"
import { isPromoted } from "./review/scorePolicy"

type TopicMemoryScan = Pick<
	typeof scans.$inferSelect,
	"id" | "topicId" | "ownerId" | "startedAt" | "topicMemoriesUpdatedAt" | "topicMemoriesWrittenAt"
>
// only public evidence and its Resource vector feed the topic memory update
export type TopicMemoryFinding = {
	id: string
	title: string | null
	snippet: string | null
	description: string
	relevanceScore: number
	rating: "up" | null
	embedding: number[] | null
	embeddingModel: string | null
	articleContext?: string | null
	publicationDateHint?: string | null
}

type TopicMemoryRow = typeof topicMemories.$inferSelect

// both extraction and claim checking read the same bounded public review explanation
const TOPIC_MEMORY_REVIEW_EXPLANATION_CHARS = 800

// identify reviews that explicitly distinguish the Finding's subject from the Topic's namesake
const DIFFERENT_PERSON_WARNING_PATTERN =
	/\b(?:reads|looks|seems|appears) like (?:a )?different person with the same name\b|\bno corroborating detail to confirm this is the same\b[^.!?]*\bcoincidental name match\b/i

// a dated article path supplies a hint. dates are never inferred from a Scan
const topicMemoryPublicationDateHint = sql<string | null>`substring(
	split_part(${resources.url}, '?', 1) from '/((?:19|20)[0-9]{2}/(?:0[1-9]|1[0-2])(?:/[0-9]{2})?)/'
)`

/**
 * A succeeded scan alone can feed its Journal.
 */
export async function loadTopicMemoryScan(scanId: string, handle: DbHandle = db): Promise<TopicMemoryScan | undefined> {
	const [scan] = await handle
		.select({
			id: scans.id,
			topicId: scans.topicId,
			ownerId: scans.ownerId,
			startedAt: scans.startedAt,
			topicMemoriesUpdatedAt: scans.topicMemoriesUpdatedAt,
			topicMemoriesWrittenAt: scans.topicMemoriesWrittenAt,
			formatVersion: scans.topicMemoriesFormatVersion,
		})
		.from(scans)
		.where(and(eq(scans.id, scanId), eq(scans.status, "succeeded")))
	if (!scan || scan.formatVersion === TOPIC_MEMORY_FACT_FORMAT_VERSION) {
		return scan
	}
	return { ...scan, topicMemoriesUpdatedAt: null, topicMemoriesWrittenAt: null }
}

/**
 * Reads bounded public evidence, excluding Findings credited to Personal sources.
 */
export async function loadTopicMemoryFindings(
	scanId: string,
	topicId: string,
	handle: DbHandle = db,
): Promise<TopicMemoryFinding[]> {
	// private sender annotations and summaries never enter this read
	return handle
		.select({
			id: findings.id,
			title: sql<string | null>`left(${resources.title}, 180)`,
			snippet: sql<string | null>`left(${resources.snippet}, 320)`,
			description: sql<string>`left(${findings.relevanceExplanation}, ${TOPIC_MEMORY_REVIEW_EXPLANATION_CHARS})`,
			relevanceScore: findings.relevanceScore,
			rating: sql<"up" | null>`case when ${findings.rating} = 'up' then 'up' end`,
			embedding: resources.embedding,
			embeddingModel: resources.embeddingModel,
			articleContext: sql<string | null>`left(${resources.content}, 640)`,
			publicationDateHint: topicMemoryPublicationDateHint,
		})
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.where(toTopicMemoryScanFindingFilter(scanId, topicId))
		.orderBy(desc(findings.relevanceScore), findings.id)
		.limit(30)
}

/**
 * Excludes weak Findings with a namesake warning and no positive rating.
 */
export function isTopicMemoryFindingEligible({
	description,
	relevanceScore,
	rating,
}: Pick<TopicMemoryFinding, "description" | "relevanceScore" | "rating">): boolean {
	return rating === "up" || isPromoted(relevanceScore) || !DIFFERENT_PERSON_WARNING_PATTERN.test(description)
}

/**
 * Rechecks eligible Finding IDs without transferring excerpts and vectors into the write transaction.
 */
export async function loadEligibleTopicMemoryFindingIds(
	scanId: string,
	topicId: string,
	handle: DbHandle,
): Promise<string[]> {
	const rows = await handle
		.select({ id: findings.id })
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.where(toTopicMemoryScanFindingFilter(scanId, topicId))
		.orderBy(desc(findings.relevanceScore), findings.id)
		.limit(30)
	return rows.map(({ id }) => id)
}

function toTopicMemoryScanFindingFilter(scanId: string, topicId: string): SQL | undefined {
	return and(toTopicMemoryFindingFilter(topicId), or(eq(findings.scanId, scanId), eq(findings.foundScanId, scanId)))
}

/**
 * Returns at most five active or outdated neighbors, with rejected topic memories excluded.
 */
export async function loadTopicMemoryNeighbors(
	topicId: string,
	embedding: number[],
	{ activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<
	(Pick<TopicMemoryRow, "id" | "kind" | "text" | "status" | "factDate" | "isAtomic"> & {
		person: TopicMemoryPerson | null
		lastSeenAt: Date
		updatedAt: Date
		feedback: TopicMemoryPromptFeedback[]
	})[]
> {
	// shortlist by distance before running grouping windows and reading feedback
	const distance = cosineDistance(topicMemories.embedding, embedding)
	const nearest = db.$with("nearest_topic_memories").as(
		db
			.select({ id: topicMemories.id, distance: distance.as("distance") })
			.from(topicMemories)
			.where(
				and(
					eq(topicMemories.topicId, topicId),
					isNotNull(topicMemories.subject),
					isNotNull(topicMemories.claimType),
					inArray(topicMemories.status, activeOnly ? ["active"] : ["active", "outdated"]),
					isNull(topicMemories.replacedById),
					eq(topicMemories.embeddingModel, TOPIC_MEMORY_EMBEDDING_MODEL),
					eq(topicMemories.isAtomic, true),
					eq(topicMemories.needsReview, false),
				),
			)
			.orderBy(distance, topicMemories.id)
			.limit(TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT),
	)
	const candidates = await db
		.with(nearest)
		.select({
			id: topicMemories.id,
			kind: topicMemories.kind,
			text: topicMemories.text,
			factDate: topicMemories.factDate,
			person: topicMemories.person,
			isAtomic: topicMemories.isAtomic,
			feedback: topicMemoryPromptFeedback,
			status: topicMemories.status,
			lastSeenAt: scans.startedAt,
			updatedAt: topicMemories.updatedAt,
			...topicMemoryGroupingColumns(),
		})
		.from(nearest)
		.innerJoin(topicMemories, eq(topicMemories.id, nearest.id))
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.orderBy(nearest.distance, nearest.id)
	return groupTopicMemories(candidates)
		.slice(0, TOPIC_MEMORY_NEIGHBOR_LIMIT)
		.flatMap(([first]) => {
			if (!first) {
				return []
			}
			const {
				subject: _subject,
				claimType: _claimType,
				value: _value,
				embedding: _embedding,
				embeddingModel: _model,
				...row
			} = first
			return [row]
		})
}

/**
 * Restricts Journal evidence to shown external Findings from public Sources.
 */
function toTopicMemoryFindingFilter(topicId: string): SQL | undefined {
	return and(
		eq(findings.topicId, topicId),
		eq(findings.sourceVisibility, "public"),
		toExternalTopicMemorySourceFilter(resources.url),
		eq(findings.personalSourceScoreBonus, 0),
		isFindingShown,
	)
}

/**
 * Reads bounded excerpts of existing claim evidence for a split or duplicate review.
 */
export async function loadTopicMemoryFindingEvidence(
	topicId: string,
	findingIds: string[],
	handle: DbHandle = db,
	claimText?: string,
): Promise<
	Map<
		string,
		{
			day: string
			title: string | null
			snippet: string | null
			description: string
			articleContext?: string
			publicationDateHint?: string | null
		}
	>
> {
	if (!findingIds.length) {
		return new Map()
	}
	// recheck each source's visibility on the caller's handle
	const rows = await handle
		.select({
			id: findings.id,
			startedAt: scans.startedAt,
			title: sql<string | null>`left(${resources.title}, 180)`,
			snippet: sql<string | null>`left(${resources.snippet}, ${claimText ? 6000 : 240})`,
			description: sql<string>`left(${findings.relevanceExplanation}, ${TOPIC_MEMORY_REVIEW_EXPLANATION_CHARS})`,
			article: claimText ? sql<string | null>`left(${resources.content}, 6000)` : sql<null>`null`,
			contentKey: resources.contentKey,
			publicationDateHint: topicMemoryPublicationDateHint,
		})
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.innerJoin(scans, eq(scans.id, findings.scanId))
		.where(and(toTopicMemoryFindingFilter(topicId), inArray(findings.id, findingIds)))
	// load at most three public articles outside the write transaction
	const evidence = await Promise.all(
		rows
			.toSorted((a, b) => findingIds.indexOf(a.id) - findingIds.indexOf(b.id))
			.map(async ({ id, startedAt, article, contentKey, ...finding }, index) => {
				const articleContext =
					claimText && index < 3 ? await toArticleExcerpt(article, contentKey, claimText, finding.snippet) : undefined
				return [
					id,
					{ ...finding, snippet: finding.snippet?.slice(0, 240) ?? null, day: toUtcDay(startedAt), articleContext },
				] as const
			}),
	)
	return new Map(evidence)
}

async function toArticleExcerpt(
	inline: string | null,
	contentKey: string | null,
	claimText: string,
	snippet: string | null,
): Promise<string | undefined> {
	// use retained article text and fall back to the selected Finding excerpt if it has expired
	const article = inline || (contentKey ? await getResourceContent(contentKey).catch(() => "") : "") || snippet || ""
	const searchable = article.toLowerCase()
	const phrase = claimText.toLowerCase().replace(/[.!?]+$/, "")
	const names = claimText.match(/\b[\p{Lu}][\p{L}’'-]+(?: +[\p{Lu}][\p{L}’'-]+)+/gu) ?? []
	// a fragment often paraphrases the source while still quoting a person or institution by name
	const match =
		[phrase, ...names.map((name) => name.toLowerCase())]
			.map((anchor) => searchable.indexOf(anchor))
			.find((position) => position >= 0) ?? 0
	const start = Math.max(0, match - 550)
	const excerpt = article.slice(start, start + 1400)
	const dateline = article.match(/^(?:Posted On|Published(?: On)?)\s*:?\s+([A-Za-z]+ \d{1,2},? \d{4})/im)?.[1]
	return dateline ? `Reported ${dateline}.\n${excerpt}` : excerpt || undefined
}
