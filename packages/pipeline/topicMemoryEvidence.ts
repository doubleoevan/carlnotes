// selects the public Findings and existing Topic Memories used to update takeaways

import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_FACT_FORMAT_VERSION, TOPIC_MEMORY_NEIGHBOR_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { type DbHandle, db, isFindingShown } from "@carlnotes/db"
import { EMBED_MODEL_NAME, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import { type TopicMemoryPromptFeedback, topicMemoryPromptFeedback } from "@carlnotes/db/topicMemories"
import { and, cosineDistance, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm"
import { toExternalTopicMemorySourceFilter } from "./review/ownTopicPages"

type TopicMemoryScan = Pick<
	typeof scans.$inferSelect,
	"id" | "topicId" | "ownerId" | "startedAt" | "topicMemoriesUpdatedAt" | "topicMemoriesWrittenAt"
>
// only public evidence and its Resource vector feed the takeaway update
type TopicMemoryFinding = {
	id: string
	title: string | null
	snippet: string | null
	description: string
	embedding: number[] | null
	embeddingModel: string | null
}

type TopicMemoryRow = typeof topicMemories.$inferSelect

/** A succeeded scan alone can feed its Journal. */
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

/** Reads bounded public evidence, excluding Findings credited to Personal sources. */
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
			description: sql<string>`left(${findings.relevanceExplanation}, 300)`,
			embedding: resources.embedding,
			embeddingModel: resources.embeddingModel,
		})
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.where(toTopicMemoryScanFindingFilter(scanId, topicId))
		.orderBy(desc(findings.relevanceScore), findings.id)
		.limit(30)
}

/** Rechecks eligible Finding IDs without transferring excerpts and vectors into the write transaction. */
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

/** Returns at most five active or outdated neighbors, with rejected takeaways excluded. */
export async function loadTopicMemoryNeighbors(
	topicId: string,
	embedding: number[],
): Promise<
	(Pick<TopicMemoryRow, "id" | "kind" | "text" | "status" | "factDate" | "isAtomic"> & {
		person: TopicMemoryPerson | null
		lastSeenAt: Date
		feedback: TopicMemoryPromptFeedback[]
	})[]
> {
	return db
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
		})
		.from(topicMemories)
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				inArray(topicMemories.status, ["active", "outdated"]),
				isNull(topicMemories.replacedById),
				eq(topicMemories.embeddingModel, EMBED_MODEL_NAME),
				or(eq(topicMemories.isAtomic, true), sql`jsonb_array_length(${topicMemoryPromptFeedback}) > 0`),
			),
		)
		.orderBy(cosineDistance(topicMemories.embedding, embedding), topicMemories.id)
		.limit(TOPIC_MEMORY_NEIGHBOR_LIMIT)
}

/** Restricts Journal evidence to shown external Findings from public Sources. */
export function toTopicMemoryFindingFilter(topicId: string): SQL | undefined {
	return and(
		eq(findings.topicId, topicId),
		eq(findings.sourceVisibility, "public"),
		toExternalTopicMemorySourceFilter(resources.url),
		eq(findings.personalSourceScoreBonus, 0),
		isFindingShown,
	)
}
