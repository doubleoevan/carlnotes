// a Topic's filtered findings: the row that the max-results filter leaves as it removes a Finding, the condition
// under which a row still holds for a page, the pages with a current filtered finding that one Scan rediscovered, the
// delete as a page goes back to the model, and the Resources that the Topic has judged

import {
	AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS,
	PERSONAL_SOURCE_SCORE_BONUS,
	type PersonalSourceScoreBonus,
} from "@carlnotes/contracts/sourceScoring"
import { type DbTransaction, db } from "@carlnotes/db"
import { filteredFindings, findings, resources } from "@carlnotes/db/schema/scans"
import { and, desc, eq, inArray, not, type SQL, sql } from "drizzle-orm"
import { hasRatedPodcastEpisodeChapter } from "../podcast/podcastEpisodeChapters"

/**
 * Returns the bonus that this Scan requires of a stored review of a Resource, as SQL over the Resource's url: the full
 * bonus for a link that a sender deliberately sent, half for an automatic contribution, and none for any other page.
 * A stronger personal contribution earns a fresh review even if the content and the context match.
 */
export function toRequiredBonusSql(personalSourceScoreBonuses: ReadonlyMap<string, PersonalSourceScoreBonus>): SQL {
	// the urls of each bonus
	const toBonusUrls = (bonus: PersonalSourceScoreBonus): string[] =>
		[...personalSourceScoreBonuses].filter(([, urlBonus]) => urlBonus === bonus).map(([url]) => url)
	const fullBonusUrls = toBonusUrls(PERSONAL_SOURCE_SCORE_BONUS)
	const halfBonusUrls = toBonusUrls(AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS)
	return sql`case when ${inArray(resources.url, fullBonusUrls)} then ${PERSONAL_SOURCE_SCORE_BONUS}::real when ${inArray(resources.url, halfBonusUrls)} then ${AUTOMATIC_PERSONAL_SOURCE_SCORE_BONUS}::real else 0::real end`
}

// what a stored review of a page has to match to stand for this Scan: the Topic, its context hash, and the bonus that
// this Scan requires of the page
export type StoredReviewMatch = { topicId: string; topicContextHash: string; requiredBonus: SQL }

/**
 * Returns the filter for a Topic's filtered findings that still hold, in a read that joins each row to its Resource:
 * the page was scored against this Scan's Topic context and the Resource's current content, with at least the bonus
 * that this Scan requires, and no chapter of the Topic holds a rating that the page's next Finding would take.
 */
export function toCurrentFilteredFindingFilter({
	topicId,
	topicContextHash,
	requiredBonus,
}: StoredReviewMatch): SQL | undefined {
	return and(
		eq(filteredFindings.topicId, topicId),
		eq(filteredFindings.reviewedContextHash, topicContextHash),
		sql`${filteredFindings.reviewedContentHash} is not distinct from ${resources.contentHash}`,
		sql`${filteredFindings.personalSourceScoreBonus} >= ${requiredBonus}`,
		not(hasRatedPodcastEpisodeChapter(topicId, filteredFindings.resourceId)),
	)
}

// a page that this Scan rediscovered whose filtered finding still holds: its Resource and the score it was removed at
export type FilteredResource = { resource: typeof resources.$inferSelect; relevanceScore: number }

/**
 * Loads the pages among the urls that a Scan discovered whose filtered findings still hold, best scored first.
 */
export async function loadFilteredResources(
	urls: string[],
	storedReviewMatch: StoredReviewMatch,
): Promise<FilteredResource[]> {
	// a Scan that discovered nothing rediscovered nothing
	if (urls.length === 0) {
		return []
	}

	// each filtered row with its Resource, among the urls alone
	return db
		.select({ resource: resources, relevanceScore: filteredFindings.relevanceScore })
		.from(filteredFindings)
		.innerJoin(resources, eq(filteredFindings.resourceId, resources.id))
		.where(and(toCurrentFilteredFindingFilter(storedReviewMatch), inArray(resources.url, urls)))
		.orderBy(desc(filteredFindings.relevanceScore))
}

// a Finding that the filter removes, as the filter read it: its Resource, what it was reviewed against, its stored
// score, and its personal source bonus
export type RemovedFindingRow = {
	resourceId: string
	reviewedContextHash: string | null
	reviewedContentHash: string | null
	relevanceScore: number
	personalSourceScoreBonus: PersonalSourceScoreBonus
}

/**
 * Writes the row that each removed Finding leaves, on the transaction that deletes the Findings. A Finding with no
 * reviewed context hash leaves none. A row that an earlier filter or an earlier attempt wrote is written over, so a
 * retried review leaves one row per Topic and Resource.
 */
export async function saveFilteredFindings(
	transaction: DbTransaction,
	topicId: string,
	removedFindingRows: RemovedFindingRow[],
): Promise<void> {
	// the hashes, the score, and the bonus alone, and never a Finding's text
	const filteredFindingRows = removedFindingRows.flatMap((removedFindingRow) =>
		removedFindingRow.reviewedContextHash === null
			? []
			: [
					{
						topicId,
						resourceId: removedFindingRow.resourceId,
						reviewedContextHash: removedFindingRow.reviewedContextHash,
						reviewedContentHash: removedFindingRow.reviewedContentHash,
						relevanceScore: removedFindingRow.relevanceScore,
						personalSourceScoreBonus: removedFindingRow.personalSourceScoreBonus,
					},
				],
	)
	if (filteredFindingRows.length === 0) {
		return
	}

	// one row per Topic and Resource, holding the latest removal
	await transaction
		.insert(filteredFindings)
		.values(filteredFindingRows)
		.onConflictDoUpdate({
			target: [filteredFindings.topicId, filteredFindings.resourceId],
			set: {
				reviewedContextHash: sql`excluded.reviewed_context_hash`,
				reviewedContentHash: sql`excluded.reviewed_content_hash`,
				relevanceScore: sql`excluded.relevance_score`,
				personalSourceScoreBonus: sql`excluded.personal_source_score_bonus`,
				filteredAt: sql`excluded.filtered_at`,
			},
		})
}

/**
 * Deletes a Topic's filtered findings of the Resources that are about to go to the model, so a page that is judged
 * again and ends with no Finding holds no place on a later Scan. Deleting again after a retry changes nothing.
 */
export async function deleteFilteredFindings(topicId: string, resourceIds: string[]): Promise<void> {
	if (resourceIds.length === 0) {
		return
	}
	await db
		.delete(filteredFindings)
		.where(and(eq(filteredFindings.topicId, topicId), inArray(filteredFindings.resourceId, resourceIds)))
}

/**
 * Returns the filter for the Resources that a Topic has judged: the ones it holds a Finding for, and the ones whose
 * Finding its max-results filter removed.
 */
export function toJudgedResourceFilter(topicId: string): SQL {
	// one list of ids, so the database reads the Topic's judged Resources by their keys and no other Resource
	const findingResourceIds = db
		.select({ resourceId: findings.resourceId })
		.from(findings)
		.where(eq(findings.topicId, topicId))
	const filteredResourceIds = db
		.select({ resourceId: filteredFindings.resourceId })
		.from(filteredFindings)
		.where(eq(filteredFindings.topicId, topicId))

	// a Resource is judged if either list holds its id
	return sql`${resources.id} in (${findingResourceIds} union ${filteredResourceIds})`
}
