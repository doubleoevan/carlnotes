// persist the public Finding and its encrypted sender-only annotations atomically
import { CUSTOM_SOURCE_SCORE_BONUS, type PersonalSourceScoreBonus } from "@carlnotes/contracts/sourceScoring"
import { type DbTransaction, db } from "@carlnotes/db"
import {
	isPersonalSourcesContextCurrent,
	type PersonalSourcesReviewContext,
} from "@carlnotes/db/personalSourcesContext"
import { lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { findingPersonalAnnotations } from "@carlnotes/db/schema/personalSources"
import { findings, type scans } from "@carlnotes/db/schema/scans"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { eq, sql } from "drizzle-orm"
import { linkPodcastEpisodeChapters, toPodcastEpisodeChapterRatingSql } from "../podcast/podcastEpisodeChapters"
import type { Resource } from "./filter"
import { clampScore } from "./scorePolicy"

type Scan = typeof scans.$inferSelect

// the finding columns a review writes
type FindingReviewFields = {
	scanId: string
	relevanceScore: number
	relevanceExplanation: string
	reviewedContextHash: string
	reviewedContentHash: string | null
}

/**
 * Returns the columns a re-score decides, so upserting one leaves a user's rating and view count untouched.
 */
export function toFindingReviewFields(review: {
	scanId: string
	score: number
	relevanceExplanation: string
	topicContextHash: string
	contentHash: string | null
}): FindingReviewFields {
	return {
		scanId: review.scanId,
		relevanceScore: review.score,
		relevanceExplanation: review.relevanceExplanation,
		reviewedContextHash: review.topicContextHash,
		reviewedContentHash: review.contentHash,
	}
}

// the scan, topic, and resource a finding belongs to, the review it records, and whether a custom Source found it
type UpsertFindingOptions = {
	scan: Scan
	topicId: string
	resource: Resource
	score: number
	relevanceExplanation: string
	topicContextHash: string
	// whether a custom Source found the resource in this Scan
	isFromCustomSource: boolean
	personalSourceScoreBonus?: PersonalSourceScoreBonus
	personalSources?: PersonalSourcesReviewContext[]
	annotations?: { userId: string; text: string }[]
}

// whether the upsert added the finding to the topic, and the relevance score that it stored
type UpsertFindingResult = { isNew: boolean; relevanceScore: number }

/**
 * Upserts one finding per topic and resource, and returns whether the finding is new and the score that it stored.
 * The scan that found the finding is written on the insert alone, and a re-score updates the review columns.
 */
export async function upsertFinding({
	scan,
	topicId,
	resource,
	score,
	relevanceExplanation,
	topicContextHash,
	isFromCustomSource,
	personalSourceScoreBonus = 0,
	personalSources,
	annotations,
}: UpsertFindingOptions): Promise<UpsertFindingResult> {
	// build the whole of what a re-score may change
	const review = toFindingReviewFields({
		scanId: scan.id,
		score,
		relevanceExplanation,
		topicContextHash,
		contentHash: resource.contentHash,
	})

	// retain the strongest personal contribution and apply one source bonus on every re-score
	const personalSourceScoreBonusSql = sql<PersonalSourceScoreBonus>`greatest(${findings.personalSourceScoreBonus}, ${personalSourceScoreBonus}::real)`
	const insertedBonus = toSourceScoreBonus({ personalSourceScoreBonus, isFromCustomSource })
	const insertedScore = clampScore(score + insertedBonus)
	const isFromCustomSourceSql = sql<boolean>`(${findings.isFromCustomSource} or ${isFromCustomSource}::boolean)`
	const sourceBonusSql = sql`case when ${personalSourceScoreBonusSql} > 0 then ${personalSourceScoreBonusSql} when ${isFromCustomSourceSql} then ${CUSTOM_SOURCE_SCORE_BONUS}::real else 0 end`
	const updatedScoreSql = sql<number>`least(1, ${score}::real + ${sourceBonusSql})`

	// upsert the topic finding. postgres returns xmax as zero for an inserted row and non-zero for an updated row
	const topicResourceRef = { topicId, resourceId: resource.id }
	const findingRow = await db.transaction(async (transaction) => {
		// serialize privacy checks with entry receipt and deletion
		await lockPersonalSourcesTopic(transaction, topicId)
		for (const context of personalSources ?? []) {
			if (!(await isPersonalSourcesContextCurrent(context, transaction))) {
				throw new Error("Personal sources changed before the Finding commit")
			}
		}
		const [savedFinding] = await transaction
			.insert(findings)
			// the finding includes the relevance score and explanation, the scan that produced them and first found the
			// finding, and a chapter's rating
			.values({
				...topicResourceRef,
				...review,
				foundScanId: scan.id,
				relevanceScore: insertedScore,
				isFromCustomSource,
				personalSourceScoreBonus,
				rating: toPodcastEpisodeChapterRatingSql(topicResourceRef),
			})
			// a re-score hits the topic and resource unique constraint, so update that row in place. the scan that first
			// found the finding stays
			.onConflictDoUpdate({
				target: [findings.topicId, findings.resourceId],
				set: {
					...review,
					relevanceScore: updatedScoreSql,
					isFromCustomSource: isFromCustomSourceSql,
					personalSourceScoreBonus: personalSourceScoreBonusSql,
				},
			})
			.returning({ id: findings.id, isNew: sql<boolean>`(xmax = 0)`, relevanceScore: findings.relevanceScore })
		if (!savedFinding) {
			throw new Error("Finding persistence returned no row")
		}

		// replace private annotations atomically with their corresponding public explanation
		await transaction
			.delete(findingPersonalAnnotations)
			.where(eq(findingPersonalAnnotations.findingId, savedFinding.id))
		await saveAnnotations({ transaction, findingId: savedFinding.id, topicId, annotations, personalSources })
		return savedFinding
	})

	// link a new finding to the chapters that narrated its resource
	if (findingRow?.isNew) {
		await linkPodcastEpisodeChapters({ ...topicResourceRef, findingId: findingRow.id })
	}
	return { isNew: findingRow?.isNew ?? false, relevanceScore: findingRow?.relevanceScore ?? insertedScore }
}

// select one source bonus for a newly stored Finding
function toSourceScoreBonus({
	personalSourceScoreBonus,
	isFromCustomSource,
}: {
	personalSourceScoreBonus: PersonalSourceScoreBonus
	isFromCustomSource: boolean
}): number {
	if (personalSourceScoreBonus > 0) {
		return personalSourceScoreBonus
	}
	return isFromCustomSource ? CUSTOM_SOURCE_SCORE_BONUS : 0
}

// validate each sender binding before writing the encrypted annotation
async function saveAnnotations({
	transaction,
	findingId,
	topicId,
	annotations,
	personalSources,
}: {
	transaction: DbTransaction
	findingId: string
	topicId: string
	annotations: UpsertFindingOptions["annotations"]
	personalSources: UpsertFindingOptions["personalSources"]
}): Promise<void> {
	for (const annotation of annotations ?? []) {
		const context = personalSources?.find((context) => context.userId === annotation.userId)
		if (!context) {
			throw new Error("Finding annotation has no matching sender context")
		}
		await transaction.insert(findingPersonalAnnotations).values({
			findingId: findingId,
			topicId,
			userId: annotation.userId,
			encryptedText: encryptPrivateText(annotation.text),
		})
	}
}
