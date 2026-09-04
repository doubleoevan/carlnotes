// review turns a Scan's discovered Resources into topic findings
import { and, eq, inArray, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { bookmarks, findings, resources, type scans, teamMembers, teamTopics, topics } from "../../db/schema"
import { buildTopicScanContext, toTopicContextHash } from "../attach"
import type { Budget } from "../budget"
import type { NewResource } from "../ingest/ingester"
import { traceStage } from "../telemetry"
import {
	dedupeResources,
	gateResources,
	loadResourcesToReview,
	loadTopicContext,
	rankBySimilarity,
	toTopicContextText,
} from "./filter"
import { fetchAndScoreResources } from "./score"
import { type ScannedSource, summarizeTopicScan, toTopicScanSummary } from "./summarize"
import { countFilteredResources, emptyReviewOutcome, emptyReviewSummary, type ReviewSummary } from "./track"

export type { ReviewSummary } from "./track"

// a persisted Scan record
type Scan = typeof scans.$inferSelect

/**
 * Reviews a Scan's discovered Resources, writes Findings and returns the counts, outcome, and summary.
 * topicId is a parameter because a deleted topic clears the Scan row's own topic id.
 * The Budget already includes what ingestion spent, so review's limits read the Scan's whole spend.
 * litellmApiKey bills its LLM calls to the topic owner's virtual key, falling back to the master key when absent.
 */
export async function reviewScan(
	scan: Scan,
	topicId: string,
	discoveredResources: NewResource[],
	scannedSources: ScannedSource[],
	budget: Budget,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<ReviewSummary> {
	// a Scan stopped during ingestion reaches the review already cancelled
	if (stopSignal?.aborted) {
		return emptyReviewSummary()
	}

	// read the topic's context once. its hash decides which Findings this Scan reviews again
	const topicScanContext = await buildTopicScanContext(topicId)
	const topicContextHash = toTopicContextHash(toTopicContextText(topicScanContext))

	// select what this Scan has to review: never reviewed, reviewed against another context, or older content
	const resourcesToReview = await loadResourcesToReview(topicId, discoveredResources, topicContextHash)
	if (resourcesToReview.length === 0) {
		// filter anyway, so a lowered max_results takes effect even when a scan finds nothing new
		await filterTopicFindings(topicId)
		return emptyReviewSummary()
	}

	// the running totals for this review. each stage below traces as its own span with what it spent
	const reviewOutcome = emptyReviewOutcome()

	// embed the topic's effective context once for the relevance gate
	if (stopSignal?.aborted) {
		return emptyReviewSummary()
	}
	const topicContext = await loadTopicContext(topicScanContext, budget, litellmApiKey)

	// the first pass embeds every resource up for review and keeps the ones relevant to the topic
	const relevantResources = await traceStage(
		"embed-filter",
		budget,
		() => gateResources(resourcesToReview, topicContext, reviewOutcome, budget, litellmApiKey, stopSignal),
		(relevantResources) => ({ toReviewCount: resourcesToReview.length, relevantCount: relevantResources.length }),
	)

	// the second pass dedupes the surviving resources best-first, so a limit defers the least relevant resources
	const resourceIdsToReview = resourcesToReview.map((resource) => resource.id)
	const resourcesToScore = await traceStage(
		"dedupe",
		budget,
		() => dedupeResources(rankBySimilarity(relevantResources), resourceIdsToReview, reviewOutcome),
		(toScore) => ({ relevantCount: relevantResources.length, toScoreCount: toScore.length }),
	)

	// the paid stage: fetch each of those Resources and score it under the Scan's limits
	const scoredResourceIds = await traceStage(
		"score",
		budget,
		() =>
			fetchAndScoreResources(
				resourcesToScore,
				scan,
				topicId,
				topicContext,
				reviewOutcome,
				budget,
				litellmApiKey,
				stopSignal,
			),
		(scoredIds) => ({ toScoreCount: resourcesToScore.length, scoredCount: scoredIds.length }),
	)

	// keep only the topic's top max_results findings now that this scan's findings are written
	const relevantUrls = await filterTopicFindings(topicId)
	reviewOutcome.keptFindings = reviewOutcome.keptFindings.filter((finding) => relevantUrls.has(finding.url))

	// summarize the scan, unless the user stopped it
	const scanSummary = stopSignal?.aborted
		? ""
		: await traceStage(
				"scan-report",
				budget,
				() =>
					toTopicScanSummary(scan.id, () =>
						summarizeTopicScan(topicContext, reviewOutcome, scannedSources, budget, litellmApiKey),
					),
				(report) => ({ isReportWritten: report.length > 0 }),
			)

	// merge the totals into the summary that the Scan records. the caller reads spend and fetch counts off the Budget
	return {
		keptCount: reviewOutcome.keptFindings.length,
		filteredCount: countFilteredResources(reviewOutcome),
		scanSummary,
		resourceIdsToScore: resourcesToScore.map((resource) => resource.id),
		scoredResourceIds,
	}
}

// keep only the topic's top max_results findings by relevance score, except bookmarked ones
async function filterTopicFindings(topicId: string): Promise<Set<string>> {
	// the topic's limit on kept findings, and what the access check needs
	const [topic] = await db
		.select({ maxResults: topics.maxResults, ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return new Set()
	}

	// the topic's findings with their ranking scores, the url each one points at, and when it was found
	const findingRows = await db
		.select({
			id: findings.id,
			relevanceScore: findings.relevanceScore,
			createdAt: findings.createdAt,
			rating: findings.rating,
			url: resources.url,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))

	// the finding ids bookmarked by someone who still has access
	const holderHasAccess = or(
		eq(bookmarks.userId, topic.ownerId),
		topic.teamId
			? inArray(
					bookmarks.userId,
					db
						.select({ userId: teamMembers.userId })
						.from(teamMembers)
						.where(and(eq(teamMembers.teamId, topic.teamId), eq(teamMembers.isActive, true))),
				)
			: sql`false`,
		inArray(
			bookmarks.userId,
			db
				.select({ userId: teamMembers.userId })
				.from(teamMembers)
				.innerJoin(teamTopics, eq(teamTopics.teamId, teamMembers.teamId))
				.where(and(eq(teamTopics.topicId, topicId), eq(teamMembers.isActive, true))),
		),
	)
	const bookmarkedRows = await db
		.selectDistinct({ findingId: bookmarks.findingId })
		.from(bookmarks)
		.innerJoin(findings, eq(bookmarks.findingId, findings.id))
		.where(and(eq(findings.topicId, topicId), holderHasAccess))

	// decide which findings fall outside the limit. a re-score can lower a score,
	// and filtering by score alone would delete a finding its user bookmarked
	const bookmarkedIds = new Set(bookmarkedRows.map((bookmarkRow) => bookmarkRow.findingId))
	const filteredIds = findingIdsToFilter(
		findingRows.map((findingRow) => ({
			...findingRow,
			isBookmarkedOrRated: bookmarkedIds.has(findingRow.id) || findingRow.rating !== null,
		})),
		topic.maxResults,
	)
	if (filteredIds.length > 0) {
		await db.delete(findings).where(inArray(findings.id, filteredIds))
	}

	// return the filtered topic finding urls
	const filteredIdSet = new Set(filteredIds)
	return new Set(
		findingRows.filter((findingRow) => !filteredIdSet.has(findingRow.id)).map((findingRow) => findingRow.url),
	)
}

/**
 * The topic's finding ids no user bookmarked or rated, ranked beyond maxResults by relevance score,
 * which need filtering. A tie goes to the newer finding, so a Topic already full of top-scored ones can
 * still update from a later Scan.
 */
export function findingIdsToFilter(
	findingRows: { id: string; relevanceScore: number; createdAt: Date; isBookmarkedOrRated: boolean }[],
	maxResults: number,
): string[] {
	// rank the rows no user bookmarked or rated and drop everything past the limit
	const rankedFilterableRows = findingRows
		.filter((findingRow) => !findingRow.isBookmarkedOrRated)
		.sort(
			(first, second) =>
				second.relevanceScore - first.relevanceScore || second.createdAt.getTime() - first.createdAt.getTime(),
		)
	return rankedFilterableRows.slice(maxResults).map((findingRow) => findingRow.id)
}
