// review turns a Scan's discovered Resources into topic findings

import { db } from "@carlnotes/db"
import { findings, resources, type scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { loadSharedCommentTexts } from "@carlnotes/db/sharedComments"
import type { Budget } from "@carlnotes/models/budget"
import { traceStage } from "@carlnotes/models/telemetry"
import { eq, inArray, isNotNull, sql } from "drizzle-orm"
import { buildTopicScanContext } from "../attach"
import type { DiscoveredResource } from "../ingest/ingester"
import { considerReviewLink, loadPersonalSourcesReviewLinks } from "../personalSources/linkQueue"
import { dedupeResources } from "./dedupe"
import { gateResources, loadResourcesToReview, loadUrlSourcePageUrls, rankBySimilarity } from "./filter"
import { loadFindingIdsWithComments } from "./reactionSignals"
import { fetchAndScoreResources } from "./score"
import { loadBookmarkedFindingRows, loadScoreExamplePages } from "./scoreExamplePages"
import { type ScannedSource, summarizeTopicScan, toTopicScanSummary } from "./summarize"
import { loadTopicContext, toReviewContextHash } from "./topicContext"
import {
	countAddedOrFilteredFindings,
	countFilteredResources,
	emptyReviewOutcome,
	emptyReviewSummary,
	type ReviewSummary,
} from "./track"

export type { ReviewSummary } from "./track"

// a persisted Scan record
type Scan = typeof scans.$inferSelect

/**
 * Reviews a Scan's discovered Resources, writes Findings and returns the counts, outcome, and summary.
 * topicId is a parameter because a deleted topic clears the Scan row's own topic id.
 * The Budget already includes what ingestion spent, so review's limits read the Scan's whole spend.
 * litellmApiKey bills the review's model calls to the virtual key of the user that the Scan bills.
 */
export async function reviewScan(
	scan: Scan,
	topicId: string,
	discoveredResources: DiscoveredResource[],
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
	const personalSourcesReview = await loadPersonalSourcesReviewLinks({ topicId, scanId: scan.id, discoveredResources })
	discoveredResources = personalSourcesReview.discoveredResources
	const topicScanContext = await buildTopicScanContext({ topicId, purpose: "review" })
	const topicContextHash = toReviewContextHash(topicScanContext)

	// select what this Scan has to review: never reviewed, reviewed against another context, or older content
	const resourcesToReview = (
		await loadResourcesToReview({
			topicId,
			discoveredResources,
			topicContextHash,
			personalSourceScoreBonuses: personalSourcesReview.personalSourceScoreBonuses,
		})
	).map((resource) => ({
		...resource,
		personalSourceScoreBonus: personalSourcesReview.personalSourceScoreBonuses.get(resource.url) ?? 0,
	}))
	// existing durable Findings already considered these links against this exact context or an explicit down rating
	const reviewUrls = new Set(resourcesToReview.map(({ url }) => url))
	for (const url of personalSourcesReview.claimedUrls) {
		if (!reviewUrls.has(url)) {
			await considerReviewLink({ topicId, scanId: scan.id, url })
		}
	}
	if (resourcesToReview.length === 0) {
		// filter anyway, so a lowered max topic findings takes effect even when a scan finds nothing new
		const { filteredFindingCount } = await filterTopicFindings(topicId)
		return { ...emptyReviewSummary(), addedOrFilteredFindingCount: filteredFindingCount }
	}

	// the Resources read again from the topic's earlier findings, which no Source returned this Scan
	const discoveredUrls = new Set(discoveredResources.map((resource) => resource.url))
	const earlierFoundCount = resourcesToReview.filter((resource) => !discoveredUrls.has(resource.url)).length

	// the Resources the Topic already holds Findings for. they are in the feed, so they pass the gate and win a dedupe
	const topicResourceRows = await db
		.select({ resourceId: findings.resourceId })
		.from(findings)
		.where(eq(findings.topicId, topicId))

	// the url Sources' own pages pass the gate and skip the dedupe, so the model reads a page the user picked
	const urlSourcePageUrls = new Set(await loadUrlSourcePageUrls(topicId))
	const urlSourcePageIds = new Set(
		resourcesToReview.filter((resource) => urlSourcePageUrls.has(resource.url)).map((resource) => resource.id),
	)

	// the Resources that pass the gate whatever they measure
	const gateExemptResourceIds = new Set([
		...topicResourceRows.map((topicResourceRow) => topicResourceRow.resourceId),
		...urlSourcePageIds,
	])

	// the running totals for this review. each stage below traces as its own span with what it spent
	const reviewOutcome = emptyReviewOutcome()
	if (personalSourcesReview.claimedUrls.size > 0) {
		reviewOutcome.onResourceConsidered = async (url, outcome) => {
			if (personalSourcesReview.claimedUrls.has(url)) {
				await considerReviewLink({ topicId, scanId: scan.id, url, ...outcome })
			}
		}
	}

	// embed the topic's effective context once for the relevance gate.
	// the score prompt also reads the pages that the topic's users liked, bookmarked, or rated down
	if (stopSignal?.aborted) {
		return emptyReviewSummary()
	}
	const [scoreExamplePages, sharedCommentTexts] = await Promise.all([
		loadScoreExamplePages(topicId),
		loadSharedCommentTexts(topicId),
	])
	const topicContext = await loadTopicContext({
		topicScanContext,
		scoreExamplePages,
		sharedCommentTexts,
		budget,
		litellmApiKey,
		shouldEmbed: resourcesToReview.some((resource) => !resource.personalSourceScoreBonus),
	})

	// gate ordinary candidates by embedding while passing matched personal links directly to review
	const relevantResources = await traceStage(
		"embed-filter",
		budget,
		() =>
			gateResources(
				resourcesToReview,
				topicContext,
				reviewOutcome,
				budget,
				litellmApiKey,
				stopSignal,
				gateExemptResourceIds,
			),
		(relevantResources) => ({ toReviewCount: resourcesToReview.length, relevantCount: relevantResources.length }),
	)

	// dedupe personal links first, followed by exempt Resources and remaining similarity-ranked candidates
	const resourceIdsToReview = resourcesToReview.map((resource) => resource.id)
	const rankedResources = rankBySimilarity(relevantResources, gateExemptResourceIds)
	const resourcesToScore = await traceStage(
		"dedupe",
		budget,
		() =>
			dedupeResources({
				relevantResources: rankedResources,
				candidateIds: resourceIdsToReview,
				reviewOutcome,
				urlSourcePageIds,
			}),
		(toScore) => ({ relevantCount: relevantResources.length, toScoreCount: toScore.length }),
	)

	// the paid stage: fetch each of those Resources and score it under the Scan's limits.
	// persist the strongest source bonus on each Finding
	const customSourceUrls = new Set(
		discoveredResources.filter(({ isFromCustomSource }) => isFromCustomSource).map(({ url }) => url),
	)
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
				customSourceUrls,
				litellmApiKey,
				stopSignal,
			),
		(scoredIds) => ({ toScoreCount: resourcesToScore.length, scoredCount: scoredIds.length }),
	)

	// count this scan's new findings, then keep only the topic's top maxTopicFindings
	const newFindingCount = reviewOutcome.keptFindings.filter((finding) => finding.isNew).length
	const { keptFindingUrls, filteredFindingCount } = await filterTopicFindings(topicId)
	reviewOutcome.keptFindings = reviewOutcome.keptFindings.filter((finding) => keptFindingUrls.has(finding.url))

	// count the findings this scan added and kept, plus the existing findings the filter removed
	const keptNewFindingCount = reviewOutcome.keptFindings.filter((finding) => finding.isNew).length
	const addedOrFilteredFindingCount = countAddedOrFilteredFindings({
		newFindingCount,
		keptNewFindingCount,
		filteredFindingCount,
	})

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
		earlierFoundCount,
		addedOrFilteredFindingCount,
		scanSummary,
		resourceIdsToScore: resourcesToScore.map((resource) => resource.id),
		scoredResourceIds,
	}
}

// keep only the topic's top maxTopicFindings findings by relevance score, except for the exempt ones: a finding that
// is bookmarked or rated, or that has a Comment
async function filterTopicFindings(
	topicId: string,
): Promise<{ keptFindingUrls: Set<string>; filteredFindingCount: number }> {
	// the topic's limit on kept findings, and what the access check needs
	const [topic] = await db
		.select({ maxTopicFindings: topics.maxTopicFindings, ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return { keptFindingUrls: new Set(), filteredFindingCount: 0 }
	}

	// the findings bookmarked by someone who still has access, and the ones that hold someone's comment, which a
	// re-score must never delete
	const [bookmarkedFindingRows, findingIdsWithComments] = await Promise.all([
		loadBookmarkedFindingRows(topicId, topic),
		loadFindingIdsWithComments(topicId, topic.ownerId),
	])
	const exemptFindingIds = [...bookmarkedFindingRows.map(({ findingId }) => findingId), ...findingIdsWithComments]

	// the topic's findings with their ranking scores, when each was found, the url it points at,
	// and whether it is exempt from the limit
	const findingRows = await db
		.select({
			id: findings.id,
			relevanceScore: findings.relevanceScore,
			createdAt: findings.createdAt,
			url: resources.url,
			isExempt: sql<boolean>`(${inArray(findings.id, exemptFindingIds)} or ${isNotNull(findings.rating)})`.mapWith(
				Boolean,
			),
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))

	// decide which findings fall outside the limit. a re-score can lower a score,
	// and filtering by score alone would delete a finding its user bookmarked or wrote on
	const filteredIds = findingIdsToFilter(findingRows, topic.maxTopicFindings)
	if (filteredIds.length > 0) {
		await db.delete(findings).where(inArray(findings.id, filteredIds))
	}

	// return the urls of the findings that remain, and how many were filtered out
	const filteredIdSet = new Set(filteredIds)
	const keptFindingUrls = new Set(
		findingRows.filter((findingRow) => !filteredIdSet.has(findingRow.id)).map((findingRow) => findingRow.url),
	)
	return { keptFindingUrls, filteredFindingCount: filteredIds.length }
}

/**
 * The topic's finding ids that are not exempt, ranked beyond maxTopicFindings by relevance score,
 * which need filtering. A tie goes to the newer finding, so a Topic already full of top-scored ones can
 * still update from a later Scan.
 */
export function findingIdsToFilter(
	findingRows: { id: string; relevanceScore: number; createdAt: Date; isExempt: boolean }[],
	maxTopicFindings: number,
): string[] {
	// rank the rows that are not exempt and drop everything past the limit
	const rankedFilterableRows = findingRows
		.filter((findingRow) => !findingRow.isExempt)
		.sort(
			(first, second) =>
				second.relevanceScore - first.relevanceScore || second.createdAt.getTime() - first.createdAt.getTime(),
		)
	return rankedFilterableRows.slice(maxTopicFindings).map((findingRow) => findingRow.id)
}
