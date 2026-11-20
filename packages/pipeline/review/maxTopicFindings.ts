// a Topic's limit on its Findings: the filter that closes a Scan by keeping the top maxTopicFindings and leaving a
// filtered finding for each one it removes, and the open places that a Scan fills from the pages filtered before

import type { PersonalSourceScoreBonus } from "@carlnotes/contracts/sourceScoring"
import { db } from "@carlnotes/db"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { eq, inArray, isNotNull, sql } from "drizzle-orm"
import { type FilteredResource, saveFilteredFindings } from "./filteredFindings"
import { loadFindingIdsWithComments } from "./reactionSignals"
import { loadBookmarkedFindingRows } from "./scoreExamplePages"

// a row that the limit ranks: its id, its score, when it was found, and whether it is exempt from the limit
type RankedFindingRow = { id: string; relevanceScore: number; createdAt: Date; isExempt: boolean }

// a Topic's Finding as the limit reads it: what ranks it, the url it points at, and what a filtered finding keeps
type TopicFindingRow = RankedFindingRow & {
	url: string
	resourceId: string
	reviewedContextHash: string | null
	reviewedContentHash: string | null
	personalSourceScoreBonus: PersonalSourceScoreBonus
}

// a Topic's limit and its Findings
type TopicFindings = { maxTopicFindings: number; findingRows: TopicFindingRow[] }

// a filtered page ranks as the oldest row, so a tie stays with the Finding that the Topic keeps
const FILTERED_RESOURCE_CREATED_AT = new Date(0)

/**
 * Keeps only the Topic's top maxTopicFindings Findings by relevance score, except for the exempt ones: a Finding that
 * is bookmarked or rated, or that has a Comment. Each removed Finding leaves a filtered finding, written in the
 * transaction that deletes it. Returns the urls of the Findings that remain and how many were removed.
 */
export async function filterTopicFindings(
	topicId: string,
): Promise<{ keptFindingUrls: Set<string>; filteredFindingCount: number }> {
	// a deleted Topic has nothing to filter
	const topicFindings = await loadTopicFindings(topicId)
	if (!topicFindings) {
		return { keptFindingUrls: new Set(), filteredFindingCount: 0 }
	}

	// decide which Findings fall outside the limit. a re-score can lower a score, and filtering by score alone would
	// delete a Finding its user bookmarked or wrote on
	const { findingRows, maxTopicFindings } = topicFindings
	const filteredIdSet = new Set(findingIdsToFilter(findingRows, maxTopicFindings))
	const removedFindingRows = findingRows.filter((findingRow) => filteredIdSet.has(findingRow.id))

	// each removed Finding leaves its filtered finding in the transaction that deletes it
	if (removedFindingRows.length > 0) {
		await db.transaction(async (transaction) => {
			await saveFilteredFindings(transaction, topicId, removedFindingRows)
			await transaction.delete(findings).where(inArray(findings.id, [...filteredIdSet]))
		})
	}

	// return the urls of the Findings that remain, and how many were filtered out
	const keptFindingUrls = new Set(
		findingRows.filter((findingRow) => !filteredIdSet.has(findingRow.id)).map((findingRow) => findingRow.url),
	)
	return { keptFindingUrls, filteredFindingCount: removedFindingRows.length }
}

/**
 * Returns the filtered pages that rank inside the Topic's limit, best scored first: the Topic's Findings and the filtered
 * pages are ranked together by the filter's own rule, and each filtered page that the filter would keep goes back to the
 * model. A full Topic whose Findings all score at least as well keeps every filtered page out.
 */
export async function loadFilteredResourcesInsideLimit(
	topicId: string,
	filteredResources: FilteredResource[],
): Promise<FilteredResource["resource"][]> {
	// no filtered page asks for no ranking
	const topicFindings = filteredResources.length > 0 ? await loadTopicFindings(topicId) : null
	if (!topicFindings) {
		return []
	}

	// rank each filtered page as a row that is not exempt and older than every Finding
	const filteredResourceRows = filteredResources.map(({ resource, relevanceScore }) => ({
		id: resource.id,
		relevanceScore,
		createdAt: FILTERED_RESOURCE_CREATED_AT,
		isExempt: false,
	}))
	const filteredIdSet = new Set(
		findingIdsToFilter([...topicFindings.findingRows, ...filteredResourceRows], topicFindings.maxTopicFindings),
	)
	return filteredResources.filter(({ resource }) => !filteredIdSet.has(resource.id)).map(({ resource }) => resource)
}

/**
 * Returns the Topic's finding ids that are not exempt and rank beyond maxTopicFindings by relevance score. A tie goes to the
 * newer finding, so a Topic already full of top-scored ones can still update from a later Scan.
 */
export function findingIdsToFilter(findingRows: RankedFindingRow[], maxTopicFindings: number): string[] {
	// rank the rows that are not exempt and drop everything past the limit
	const rankedFilterableRows = findingRows
		.filter((findingRow) => !findingRow.isExempt)
		.sort(
			(first, second) =>
				second.relevanceScore - first.relevanceScore || second.createdAt.getTime() - first.createdAt.getTime(),
		)
	return rankedFilterableRows.slice(maxTopicFindings).map((findingRow) => findingRow.id)
}

// the Topic's limit on kept Findings and its Findings as the limit reads them, or null for a Topic that is gone
async function loadTopicFindings(topicId: string): Promise<TopicFindings | null> {
	// the Topic's limit on kept Findings, and what the access check needs
	const [topic] = await db
		.select({ maxTopicFindings: topics.maxTopicFindings, ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return null
	}

	// the Findings bookmarked by someone who still has access, and the ones that hold someone's Comment, which a
	// re-score must never delete
	const [bookmarkedFindingRows, findingIdsWithComments] = await Promise.all([
		loadBookmarkedFindingRows(topicId, topic),
		loadFindingIdsWithComments(topicId, topic.ownerId),
	])
	const exemptFindingIds = [...bookmarkedFindingRows.map(({ findingId }) => findingId), ...findingIdsWithComments]

	// the Topic's Findings with their ranking scores, when each was found, the url it points at, whether it is exempt
	// from the limit, and what its filtered finding would keep
	const findingRows = await db
		.select({
			id: findings.id,
			relevanceScore: findings.relevanceScore,
			createdAt: findings.createdAt,
			url: resources.url,
			isExempt: sql<boolean>`(${inArray(findings.id, exemptFindingIds)} or ${isNotNull(findings.rating)})`.mapWith(
				Boolean,
			),
			resourceId: findings.resourceId,
			reviewedContextHash: findings.reviewedContextHash,
			reviewedContentHash: findings.reviewedContentHash,
			personalSourceScoreBonus: findings.personalSourceScoreBonus,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))
	return { maxTopicFindings: topic.maxTopicFindings, findingRows }
}
