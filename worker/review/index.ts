// review turns a Scan's discovered Resources into topic findings: filter down to what is worth paying for,
// rank it, score the top of that ranking under the Scan's ceilings, then summarize what happened.
// the free filter stages run first, so the paid stages only ever spend money on candidates that survived them
import { eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { bookmarks, findings, type scans, topics } from "../../db/schema"
import type { NewResource } from "../adapters/adapter"
import { admitResources, gateResources, loadTopicContext, loadUnscoredResources, rankBySimilarity } from "./filter"
import { fetchAndScoreResources } from "./score"
import { type ScannedSource, summarizeTopicScan, toTopicScanSummary } from "./summarize"
import { countFilteredResources, emptyReviewOutcome, emptyReviewSummary, newBudget, type ReviewSummary } from "./track"

// a persisted Scan record
type Scan = typeof scans.$inferSelect

/**
 * Reviews a Scan's discovered Resources, writes Findings and returns the counts, cost, outcome, and summary.
 * topicId is a parameter because a deleted topic clears the Scan row's own topic id.
 * litellmApiKey bills its LLM calls to the topic owner's virtual key, falling back to the master key when absent.
 */
export async function reviewScan(
	scan: Scan,
	topicId: string,
	discoveredResources: NewResource[],
	scannedSources: ScannedSource[],
	litellmApiKey?: string,
): Promise<ReviewSummary> {
	// load the unscored list of discovered Resources for this Topic
	const unscoredResources = await loadUnscoredResources(topicId, discoveredResources)
	if (unscoredResources.length === 0) {
		// filter anyway, so a lowered max_results takes effect even when a scan finds nothing new
		await filterTopicFindings(topicId)
		return emptyReviewSummary()
	}

	// running state of the budget, and the per-outcome review totals
	const budget = newBudget()
	const reviewOutcome = emptyReviewOutcome()

	// embed the topic's effective context once for the relevance gate, keeping its name and text for the scorer and the report
	const topicContext = await loadTopicContext(topicId, budget, litellmApiKey)

	// the first pass embeds every candidate and keeps the ones relevant to the topic
	const survivingResources = await gateResources(unscoredResources, topicContext, reviewOutcome, budget, litellmApiKey)

	// the second pass dedupes the surviving resources best-first, so a limit defers the least relevant resources
	const candidateIds = unscoredResources.map((resource) => resource.id)
	const admittedResources = await admitResources(rankBySimilarity(survivingResources), candidateIds, reviewOutcome)
	await fetchAndScoreResources(admittedResources, scan, topicId, topicContext, reviewOutcome, budget, litellmApiKey)

	// keep only the topic's top max_results findings now that this scan's findings are written
	await filterTopicFindings(topicId)

	// summarize the scan
	const scanSummary = await toTopicScanSummary(scan.id, () =>
		summarizeTopicScan(topicContext, reviewOutcome, scannedSources, budget, litellmApiKey),
	)

	// fold the totals into the summary that the Scan records
	return {
		keptCount: reviewOutcome.keptFindings.length,
		filteredCount: countFilteredResources(reviewOutcome),
		// spend and the report round out what the Scan stores
		cost: budget.spent,
		stageCosts: budget.stageCosts,
		scanSummary,
		// the reused, revalidated, and fetched counts
		reusedCount: budget.fetchCounts.reusedCount,
		revalidatedCount: budget.fetchCounts.revalidatedCount,
		fetchedCount: budget.fetchCounts.fetchedCount,
	}
}

// keep only the topic's top max_results findings by relevance score, sparing bookmarked ones.
async function filterTopicFindings(topicId: string): Promise<void> {
	// the topic's cap on kept findings
	const [topic] = await db.select({ maxResults: topics.maxResults }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return
	}

	// the topic's findings with their ranking scores
	const findingRows = await db
		.select({ id: findings.id, relevanceScore: findings.relevanceScore })
		.from(findings)
		.where(eq(findings.topicId, topicId))

	// the finding ids anyone bookmarked on this topic
	const bookmarkedRows = await db
		.selectDistinct({ findingId: bookmarks.findingId })
		.from(bookmarks)
		.innerJoin(findings, eq(bookmarks.findingId, findings.id))
		.where(eq(findings.topicId, topicId))

	// decide the prune set, then delete it in one statement
	const bookmarkedIds = new Set(bookmarkedRows.map((row) => row.findingId))
	const filteredIds = findingIdsToFilter(
		findingRows.map((findingRow) => ({ ...findingRow, isBookmarked: bookmarkedIds.has(findingRow.id) })),
		topic.maxResults,
	)
	if (filteredIds.length > 0) {
		await db.delete(findings).where(inArray(findings.id, filteredIds))
	}
}

/**
 * The topic's non-bookmarked finding ids that are ranked beyond maxResults by relevance score and need to be filtered
 */
export function findingIdsToFilter(
	findingRows: { id: string; relevanceScore: number; isBookmarked: boolean }[],
	maxResults: number,
): string[] {
	// rank the unbookmarked rows and drop everything past the cap
	const rankedUnbookmarkedRows = findingRows
		.filter((findingRow) => !findingRow.isBookmarked)
		.sort((first, second) => second.relevanceScore - first.relevanceScore)
	return rankedUnbookmarkedRows.slice(maxResults).map((findingRow) => findingRow.id)
}
