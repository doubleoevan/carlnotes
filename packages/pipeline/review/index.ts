// review turns a Scan's discovered Resources into topic findings

import { db } from "@carlnotes/db"
import { findings, type scans } from "@carlnotes/db/schema/scans"
import { loadSharedCommentTexts } from "@carlnotes/db/sharedComments"
import type { Budget } from "@carlnotes/models/budget"
import { traceStage } from "@carlnotes/models/telemetry"
import { eq } from "drizzle-orm"
import { buildTopicScanContext } from "../attach"
import type { ResourceDiscovery } from "../ingest/ingester"
import { considerReviewLink, loadPersonalSourcesReviewLinks } from "../personalSources/linkQueue"
import { loadTopicMemoryPrompt } from "../topicMemoryPrompt"
import { dedupeResources } from "./dedupe"
import { gateResources, loadResourcesToReview, loadUrlSourcePageUrls, rankBySimilarity } from "./filter"
import { deleteFilteredFindings } from "./filteredFindings"
import { filterTopicFindings } from "./maxTopicFindings"
import { isCarlNotesGeneratedContentUrl, isOwnTopicPageUrl } from "./ownTopicPages"
import { fetchAndScoreResources } from "./score"
import { loadScoreExamplePages } from "./scoreExamplePages"
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
	discoveredResources: ResourceDiscovery[],
	scannedSources: ScannedSource[],
	budget: Budget,
	litellmApiKey?: string,
	stopSignal?: AbortSignal,
): Promise<ReviewSummary> {
	// a Scan stopped during ingestion reaches the review already cancelled
	if (stopSignal?.aborted) {
		return emptyReviewSummary()
	}

	// drop the topic's own pages on CarlNotes
	discoveredResources = discoveredResources.filter(
		({ url }) => !isOwnTopicPageUrl(url, topicId) && !isCarlNotesGeneratedContentUrl(url),
	)

	// read the topic's context once. its hash decides which Findings this Scan reviews again
	const personalSourcesReview = await loadPersonalSourcesReviewLinks({ topicId, scanId: scan.id, discoveredResources })
	discoveredResources = personalSourcesReview.discoveredResources
	const topicScanContext = await buildTopicScanContext({ topicId, purpose: "review" })
	const topicContextHash = toReviewContextHash(topicScanContext)

	// select what this Scan has to review: never reviewed, reviewed against another context, or older content, a page
	// filtered before that an open place takes, and never one of the topic's own pages that an earlier Finding holds
	const resourcesToReview = (
		await loadResourcesToReview({
			topicId,
			discoveredResources,
			topicContextHash,
			personalSourceScoreBonuses: personalSourcesReview.personalSourceScoreBonuses,
		})
	)
		.filter(({ url }) => !isOwnTopicPageUrl(url, topicId) && !isCarlNotesGeneratedContentUrl(url))
		.map((resource) => ({
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
	const [scoreExamplePages, sharedCommentTexts, topicMemoryPrompt] = await Promise.all([
		loadScoreExamplePages(topicId),
		loadSharedCommentTexts(topicId),
		loadTopicMemoryPrompt({ topicId }),
	])
	const topicContext = await loadTopicContext({
		topicScanContext,
		scoreExamplePages,
		sharedCommentTexts,
		topicMemoryPrompt,
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
				topicId,
				relevantResources: rankedResources,
				candidateIds: resourceIdsToReview,
				reviewOutcome,
				urlSourcePageIds,
			}),
		(toScore) => ({ relevantCount: relevantResources.length, toScoreCount: toScore.length }),
	)

	// a page that goes to the model holds its place no longer: one that ends with no Finding leaves no filtered finding,
	// and the filter writes a new one for a Finding that it removes again
	await deleteFilteredFindings(
		topicId,
		resourcesToScore.map((resource) => resource.id),
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
