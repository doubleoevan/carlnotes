// review turns a Scan's discovered Resources into topic findings: filter down to what is worth paying for,
// rank it, score the top of that ranking under the Scan's ceilings, then summarize what happened.
// the free filter stages run first, so the paid stages only ever spend money on candidates that survived them
import { eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { bookmarks, findings, resources, type scans, topics } from "../../db/schema"
import type { Budget } from "../budget"
import type { NewResource } from "../ingest/ingester"
import { traceStage } from "../telemetry"
import { admitResources, gateResources, loadTopicContext, loadUnscoredResources, rankBySimilarity } from "./filter"
import { fetchAndScoreResources } from "./score"
import { type ScannedSource, summarizeTopicScan, toTopicScanSummary } from "./summarize"
import { countFilteredResources, emptyReviewOutcome, emptyReviewSummary, type ReviewSummary } from "./track"

export type { ReviewSummary } from "./track"

// a persisted Scan record
type Scan = typeof scans.$inferSelect

/**
 * Reviews a Scan's discovered Resources, writes Findings and returns the counts, outcome, and summary.
 * topicId is a parameter because a deleted topic clears the Scan row's own topic id.
 * The Budget arrives already carrying what ingestion spent, so review's ceilings read the Scan's whole spend.
 * litellmApiKey bills its LLM calls to the topic owner's virtual key, falling back to the master key when absent.
 */
export async function reviewScan(
	scan: Scan,
	topicId: string,
	discoveredResources: NewResource[],
	scannedSources: ScannedSource[],
	budget: Budget,
	litellmApiKey?: string,
): Promise<ReviewSummary> {
	// load the unscored list of discovered Resources for this Topic
	const unscoredResources = await loadUnscoredResources(topicId, discoveredResources)
	if (unscoredResources.length === 0) {
		// filter anyway, so a lowered max_results takes effect even when a scan finds nothing new
		await filterTopicFindings(topicId)
		return emptyReviewSummary()
	}

	// the running totals for this review. each stage below traces as its own span carrying what it spent
	const reviewOutcome = emptyReviewOutcome()

	// embed the topic's effective context once for the relevance gate, keeping its name and text for the scorer and the report
	const topicContext = await loadTopicContext(topicId, budget, litellmApiKey)

	// the first pass embeds every candidate and keeps the ones relevant to the topic
	const survivingResources = await traceStage(
		"embed-filter",
		budget,
		() => gateResources(unscoredResources, topicContext, reviewOutcome, budget, litellmApiKey),
		(survivors) => ({ candidateCount: unscoredResources.length, survivorCount: survivors.length }),
	)

	// the second pass dedupes the surviving resources best-first, so a limit defers the least relevant resources
	const candidateIds = unscoredResources.map((resource) => resource.id)
	const admittedResources = await traceStage(
		"dedupe",
		budget,
		() => admitResources(rankBySimilarity(survivingResources), candidateIds, reviewOutcome),
		(admitted) => ({ survivorCount: survivingResources.length, admittedCount: admitted.length }),
	)

	// the paid stage: fetch each admitted Resource and score it under the Scan's ceilings
	const scoredResourceIds = await traceStage(
		"score",
		budget,
		() => fetchAndScoreResources(admittedResources, scan, topicId, topicContext, reviewOutcome, budget, litellmApiKey),
		(scoredIds) => ({ admittedCount: admittedResources.length, scoredCount: scoredIds.length }),
	)

	// keep only the topic's top max_results findings now that this scan's findings are written.
	// narrow the kept findings list to what survived. the recap and the email's link allowlist are both written from it
	const survivingUrls = await filterTopicFindings(topicId)
	reviewOutcome.keptFindings = reviewOutcome.keptFindings.filter((finding) => survivingUrls.has(finding.url))

	// summarize the scan
	const scanSummary = await traceStage(
		"scan-report",
		budget,
		() =>
			toTopicScanSummary(scan.id, () =>
				summarizeTopicScan(topicContext, reviewOutcome, scannedSources, budget, litellmApiKey),
			),
		(report) => ({ isReportWritten: report.length > 0 }),
	)

	// fold the totals into the summary that the Scan records. the caller reads spend and fetch counts off the Budget
	return {
		keptCount: reviewOutcome.keptFindings.length,
		filteredCount: countFilteredResources(reviewOutcome),
		scanSummary,
		scoredResourceIds,
	}
}

// keep only the topic's top max_results findings by relevance score, sparing bookmarked ones.
// returns the urls that survive for the recap and the email's link allowlist
async function filterTopicFindings(topicId: string): Promise<Set<string>> {
	// the topic's cap on kept findings
	const [topic] = await db.select({ maxResults: topics.maxResults }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return new Set()
	}

	// the topic's findings with their ranking scores, the url each one points at, and when it was found
	const findingRows = await db
		.select({
			id: findings.id,
			relevanceScore: findings.relevanceScore,
			createdAt: findings.createdAt,
			url: resources.url,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))

	// the finding ids anyone bookmarked on this topic
	const bookmarkedRows = await db
		.selectDistinct({ findingId: bookmarks.findingId })
		.from(bookmarks)
		.innerJoin(findings, eq(bookmarks.findingId, findings.id))
		.where(eq(findings.topicId, topicId))

	// decide which findings fall outside the cap, then delete them in one statement
	const bookmarkedIds = new Set(bookmarkedRows.map((row) => row.findingId))
	const filteredIds = findingIdsToFilter(
		findingRows.map((findingRow) => ({ ...findingRow, isBookmarked: bookmarkedIds.has(findingRow.id) })),
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
 * The topic's non-bookmarked finding ids ranked beyond maxResults by relevance score, which need filtering.
 * A tie goes to the newer finding, so a Topic already full of top-scored ones can still update from a later Scan.
 */
export function findingIdsToFilter(
	findingRows: { id: string; relevanceScore: number; createdAt: Date; isBookmarked: boolean }[],
	maxResults: number,
): string[] {
	// rank the unbookmarked rows and drop everything past the cap
	const rankedUnbookmarkedRows = findingRows
		.filter((findingRow) => !findingRow.isBookmarked)
		.sort(
			(first, second) =>
				second.relevanceScore - first.relevanceScore || second.createdAt.getTime() - first.createdAt.getTime(),
		)
	return rankedUnbookmarkedRows.slice(maxResults).map((findingRow) => findingRow.id)
}
