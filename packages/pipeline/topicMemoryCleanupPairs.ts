// loads the flagged Topic Memory pairs and their public evidence
import { toUtcDay } from "@carlnotes/contracts/time"
import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import { type DbHandle, db } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topicMemories } from "@carlnotes/db/schema/topicMemories"
import {
	type TopicMemoryPromptFeedback,
	topicMemoryCorrection,
	topicMemoryIsSaved,
	topicMemoryPromptFeedback,
} from "@carlnotes/db/topicMemories"
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { toTopicMemoryFindingFilter } from "./topicMemoryEvidence"
import {
	toTopicMemoryPersonMatchKey,
	toTopicMemorySimilarity,
	toTopicMemorySimilarityAction,
} from "./topicMemoryOperations"
import { canShareTopicMemoryEvent, toTopicMemoryPairId } from "./topicMemoryRetention"

// read the active takeaways and any flagged historical matches that can join them
export async function loadTopicMemoryCleanupRows(handle: DbHandle, topicId: string): Promise<TopicMemoryCleanupRow[]> {
	// the first and latest provenance can come from different entries in a cluster
	const firstScans = handle.select({ id: scans.id, startedAt: scans.startedAt }).from(scans).as("first_brew")
	const flaggedTargets = handle
		.select({ id: topicMemories.reviewMatchId })
		.from(topicMemories)
		.where(
			and(eq(topicMemories.topicId, topicId), eq(topicMemories.status, "active"), eq(topicMemories.needsReview, true)),
		)
	const rows = await handle
		.select({
			id: topicMemories.id,
			text: topicMemories.text,
			correction: topicMemoryCorrection,
			updatedAt: topicMemories.updatedAt,
			isActive: sql<boolean>`${topicMemories.status} = 'active'`,
			embedding: topicMemories.embedding,
			isSavedTakeaway: topicMemoryIsSaved,
			hasCorrection: sql<boolean>`${topicMemoryCorrection} is not null`,
			person: topicMemories.person,
			factDate: topicMemories.factDate,
			feedback: topicMemoryPromptFeedback,
			firstScanId: topicMemories.firstScanId,
			firstSeenAt: firstScans.startedAt,
			lastSeenScanId: topicMemories.lastSeenScanId,
			lastSeenAt: scans.startedAt,
			findingIds: topicMemories.findingIds,
			importance: topicMemories.importance,
			needsReview: topicMemories.needsReview,
			reviewMatchId: topicMemories.reviewMatchId,
			embeddingModel: topicMemories.embeddingModel,
		})
		.from(topicMemories)
		.innerJoin(firstScans, eq(firstScans.id, topicMemories.firstScanId))
		.innerJoin(scans, eq(scans.id, topicMemories.lastSeenScanId))
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.isAtomic, true),
				or(
					eq(topicMemories.status, "active"),
					and(
						eq(topicMemories.status, "outdated"),
						isNull(topicMemories.replacedById),
						inArray(topicMemories.id, flaggedTargets),
					),
				),
			),
		)
	return rows.map((row) => ({ ...row, personMatchKey: toTopicMemoryPersonMatchKey(row.person) }))
}

type TopicMemoryCleanupRow = {
	id: string
	text: string
	correction: string | null
	updatedAt: Date
	isActive: boolean
	embedding: number[]
	isSavedTakeaway: boolean
	hasCorrection: boolean
	personMatchKey: string | null
	person: TopicMemoryPerson | null
	factDate: string | null
	feedback: TopicMemoryPromptFeedback[]
	// the first and last Scans can move independently during a merge
	firstScanId: string
	firstSeenAt: Date
	lastSeenScanId: string
	lastSeenAt: Date
	findingIds: string[]
	importance: number
	// retain the specific pair that qualified for the lower threshold
	needsReview: boolean
	reviewMatchId: string | null
	embeddingModel: string
}

const FINDINGS_PER_REVIEW_SIDE = 3
const MAX_CLEANUP_REVIEW_PAIRS = 12

type ReviewVerdict = "duplicate" | "distinct" | "uncertain"
export type TopicMemoryCleanupReview = { id: string; revision: string; verdict: ReviewVerdict }
type ReviewSide = Pick<
	TopicMemoryCleanupRow,
	"id" | "text" | "correction" | "firstSeenAt" | "lastSeenAt" | "findingIds" | "factDate" | "person" | "feedback"
>
type PendingReviewPair = { id: string; revision: string; flagged: ReviewSide; match: ReviewSide; updatedAt: Date }
type ReviewEvidence = { day: string; title: string | null; snippet: string | null; description: string }
export type TopicMemoryCleanupPair = {
	id: string
	revision: string
	takeaways: {
		text: string
		correction: string | null
		factDate?: string | null
		person?: ReviewSide["person"]
		feedback?: TopicMemoryPromptFeedback[]
		firstSeenDay: string
		lastSeenDay: string
		findings: ReviewEvidence[]
	}[]
}

/** Loads the text, observation days, and bounded public provenance for each pending pair. */
export async function loadTopicMemoryCleanupPairs(topicId: string): Promise<TopicMemoryCleanupPair[]> {
	const pairs = toReviewPairs(await loadTopicMemoryCleanupRows(db, topicId))
		.sort((left, right) => left.updatedAt.getTime() - right.updatedAt.getTime() || left.id.localeCompare(right.id))
		.slice(0, MAX_CLEANUP_REVIEW_PAIRS)
	const findingIds = [
		...new Set(
			pairs.flatMap(({ flagged, match }) => [
				...flagged.findingIds.slice(-FINDINGS_PER_REVIEW_SIDE),
				...match.findingIds.slice(-FINDINGS_PER_REVIEW_SIDE),
			]),
		),
	]
	const evidence = await loadReviewEvidence(topicId, findingIds)
	return pairs.map(({ id, revision, flagged, match }) => ({
		id,
		revision,
		takeaways: [flagged, match].map(
			({ text, correction, factDate, person, feedback, firstSeenAt, lastSeenAt, findingIds: sourceIds }) => ({
				text,
				correction,
				factDate,
				person,
				feedback,
				firstSeenDay: toUtcDay(firstSeenAt),
				lastSeenDay: toUtcDay(lastSeenAt),
				findings: sourceIds.slice(-FINDINGS_PER_REVIEW_SIDE).flatMap((findingId) => evidence.get(findingId) ?? []),
			}),
		),
	}))
}

// only current, shown public Findings for this Topic can corroborate a claim
async function loadReviewEvidence(topicId: string, findingIds: string[]): Promise<Map<string, ReviewEvidence>> {
	if (!findingIds.length) {
		return new Map()
	}

	const rows = await db
		.select({
			id: findings.id,
			startedAt: scans.startedAt,
			title: sql<string | null>`left(${resources.title}, 180)`,
			snippet: sql<string | null>`left(${resources.snippet}, 240)`,
			description: sql<string>`left(${findings.relevanceExplanation}, 240)`,
		})
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.innerJoin(scans, eq(scans.id, findings.scanId))
		.where(and(toTopicMemoryFindingFilter(topicId), inArray(findings.id, findingIds)))
		.orderBy(desc(scans.startedAt), findings.id)
	return new Map(rows.map(({ id, startedAt, ...finding }) => [id, { ...finding, day: toUtcDay(startedAt) }]))
}

export function toReviewPairs(rows: TopicMemoryCleanupRow[]): PendingReviewPair[] {
	// one flag refers to the match that was actually compared during the write
	const byId = new Map(rows.map((row) => [row.id, row]))
	const pairs = new Map<string, PendingReviewPair>()
	for (const flagged of rows) {
		const match =
			flagged.isActive && flagged.needsReview && flagged.reviewMatchId ? byId.get(flagged.reviewMatchId) : undefined
		if (
			!match ||
			flagged.id === match.id ||
			flagged.embeddingModel !== match.embeddingModel ||
			flagged.personMatchKey !== match.personMatchKey ||
			!canShareTopicMemoryEvent(flagged.factDate, match.factDate)
		) {
			continue
		}
		const cosine = toTopicMemorySimilarity(flagged.embedding, match.embedding)
		if (toTopicMemorySimilarityAction(cosine, [flagged.text, match.text]) !== "flag") {
			continue
		}
		const id = toTopicMemoryPairId(flagged.id, match.id)
		const revision = JSON.stringify(
			[flagged, match].map(
				({ id: memoryId, updatedAt, text, correction, feedback, findingIds, firstSeenAt, lastSeenAt }) => [
					memoryId,
					updatedAt,
					text,
					correction,
					feedback,
					findingIds,
					firstSeenAt,
					lastSeenAt,
				],
			),
		)
		pairs.set(id, { id, revision, flagged, match, updatedAt: flagged.updatedAt })
	}
	return [...pairs.values()]
}
