// review turns a Scan's discovered Resources into topic findings
import { and, desc, eq, inArray, isNotNull, max, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { bookmarks, findings, resources, type scans, teamMembers, teamTopics, topics } from "../../db/schema"
import { buildTopicScanContext, toTopicContextHash } from "../attach"
import type { Budget } from "../budget"
import type { DiscoveredResource } from "../ingest/ingester"
import { traceStage } from "../telemetry"
import {
	dedupeResources,
	gateResources,
	loadResourcesToReview,
	loadTopicContext,
	loadUrlSourcePageUrls,
	rankBySimilarity,
	type ScoreExamplePage,
	type ScoreExamplePages,
	toTopicContextText,
} from "./filter"
import { fetchAndScoreResources } from "./score"
import { type ScannedSource, summarizeTopicScan, toTopicScanSummary } from "./summarize"
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

// the topic's owner and owning team, which decide whose bookmarks count
type BookmarkTopic = { ownerId: string; teamId: string | null }

// one of the topic's bookmarked findings, with its page
type BookmarkedFindingRow = ScoreExamplePage & { findingId: string }

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
	const topicScanContext = await buildTopicScanContext(topicId)
	const topicContextHash = toTopicContextHash(toTopicContextText(topicScanContext))

	// select what this Scan has to review: never reviewed, reviewed against another context, or older content
	const resourcesToReview = await loadResourcesToReview(topicId, discoveredResources, topicContextHash)
	if (resourcesToReview.length === 0) {
		// filter anyway, so a lowered max topic findings takes effect even when a scan finds nothing new
		const { filteredFindingCount } = await filterTopicFindings(topicId)
		return { ...emptyReviewSummary(), addedOrFilteredFindingCount: filteredFindingCount }
	}

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

	// embed the topic's effective context once for the relevance gate.
	// the score prompt also reads the pages that the topic's users liked, bookmarked, or rated down
	if (stopSignal?.aborted) {
		return emptyReviewSummary()
	}
	const scoreExamplePages = await loadScoreExamplePages(topicId)
	const topicContext = await loadTopicContext({ topicScanContext, scoreExamplePages, budget, litellmApiKey })

	// the first pass embeds every resource up for review and keeps the ones relevant to the topic
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

	// the second pass dedupes the surviving resources best-first, so a limit defers the least relevant resources. an
	// exempt Resource walks first, so a new near-duplicate of it is the one dropped and no limit defers its review
	const resourceIdsToReview = resourcesToReview.map((resource) => resource.id)
	const rankedResources = rankBySimilarity(relevantResources)
	const gateExemptResourcesFirst = [
		...rankedResources.filter((rankedResource) => gateExemptResourceIds.has(rankedResource.resource.id)),
		...rankedResources.filter((rankedResource) => !gateExemptResourceIds.has(rankedResource.resource.id)),
	]
	const resourcesToScore = await traceStage(
		"dedupe",
		budget,
		() =>
			dedupeResources({
				relevantResources: gateExemptResourcesFirst,
				candidateIds: resourceIdsToReview,
				reviewOutcome,
				urlSourcePageIds,
			}),
		(toScore) => ({ relevantCount: relevantResources.length, toScoreCount: toScore.length }),
	)

	// the paid stage: fetch each of those Resources and score it under the Scan's limits.
	// a Resource that a custom Source found this Scan earns its Finding a score bonus
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
		addedOrFilteredFindingCount,
		scanSummary,
		resourceIdsToScore: resourcesToScore.map((resource) => resource.id),
		scoredResourceIds,
	}
}

// keep only the topic's top maxTopicFindings findings by relevance score, except for bookmarked or rated findings
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

	// the findings bookmarked by someone who still has access
	const bookmarkedFindingRows = await loadBookmarkedFindingRows(topicId, topic)
	const bookmarkedFindingIds = bookmarkedFindingRows.map(({ findingId }) => findingId)

	// the topic's findings with their ranking scores, when each was found, the url it points at,
	// and whether a user bookmarked or rated it
	const findingRows = await db
		.select({
			id: findings.id,
			relevanceScore: findings.relevanceScore,
			createdAt: findings.createdAt,
			url: resources.url,
			isBookmarkedOrRated:
				sql<boolean>`(${inArray(findings.id, bookmarkedFindingIds)} or ${isNotNull(findings.rating)})`.mapWith(Boolean),
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))

	// decide which findings fall outside the limit. a re-score can lower a score,
	// and filtering by score alone would delete a finding its user bookmarked
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

// load the pages that the score prompt shows as examples. the bookmarked pages by newest bookmark,
// then the other pages rated thumbs up, then the pages rated thumbs down, each rated group best-scored first
async function loadScoreExamplePages(topicId: string): Promise<ScoreExamplePages> {
	// the topic's owner and owning team decide whose bookmarks count
	const [topic] = await db
		.select({ ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return { likedOrBookmarkedPages: [], ratedDownPages: [] }
	}

	// the bookmarked findings, and the topic's rated findings best-scored first
	const [bookmarkedFindingRows, ratedFindingRows] = await Promise.all([
		loadBookmarkedFindingRows(topicId, topic),
		db
			.select({ findingId: findings.id, title: resources.title, url: resources.url, rating: findings.rating })
			.from(findings)
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.where(and(eq(findings.topicId, topicId), isNotNull(findings.rating)))
			.orderBy(desc(findings.relevanceScore)),
	])

	// a rating of thumbs down outweighs a bookmark, and a liked finding that is also bookmarked is listed once
	const ratedDownPages = ratedFindingRows.filter((ratedFindingRow) => ratedFindingRow.rating === "down")
	const ratedDownFindingIds = new Set(ratedDownPages.map((ratedDownPage) => ratedDownPage.findingId))
	const bookmarkedFindingIds = new Set(
		bookmarkedFindingRows.map((bookmarkedFindingRow) => bookmarkedFindingRow.findingId),
	)
	const likedOrBookmarkedPages = [
		...bookmarkedFindingRows.filter((bookmarkedFindingRow) => !ratedDownFindingIds.has(bookmarkedFindingRow.findingId)),
		...ratedFindingRows.filter(
			(ratedFindingRow) => ratedFindingRow.rating === "up" && !bookmarkedFindingIds.has(ratedFindingRow.findingId),
		),
	]
	return { likedOrBookmarkedPages, ratedDownPages }
}

/**
 * Loads the topic's findings that someone who still has access bookmarked, with their pages, newest bookmark first.
 */
export async function loadBookmarkedFindingRows(
	topicId: string,
	topic: BookmarkTopic,
): Promise<BookmarkedFindingRow[]> {
	// a bookmark counts if its user owns the topic or is an active member of a team that holds it
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

	// the bookmarked findings of the topic with their pages
	return (
		db
			.select({ findingId: bookmarks.findingId, title: resources.title, url: resources.url })
			.from(bookmarks)
			.innerJoin(findings, eq(bookmarks.findingId, findings.id))
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.where(and(eq(findings.topicId, topicId), holderHasAccess))
			// one row per finding, ordered by its newest bookmark
			.groupBy(bookmarks.findingId, resources.title, resources.url)
			.orderBy(desc(max(bookmarks.createdAt)))
	)
}

/**
 * The topic's finding ids no user bookmarked or rated, ranked beyond maxTopicFindings by relevance score,
 * which need filtering. A tie goes to the newer finding, so a Topic already full of top-scored ones can
 * still update from a later Scan.
 */
export function findingIdsToFilter(
	findingRows: { id: string; relevanceScore: number; createdAt: Date; isBookmarkedOrRated: boolean }[],
	maxTopicFindings: number,
): string[] {
	// rank the rows no user bookmarked or rated and drop everything past the limit
	const rankedFilterableRows = findingRows
		.filter((findingRow) => !findingRow.isBookmarkedOrRated)
		.sort(
			(first, second) =>
				second.relevanceScore - first.relevanceScore || second.createdAt.getTime() - first.createdAt.getTime(),
		)
	return rankedFilterableRows.slice(maxTopicFindings).map((findingRow) => findingRow.id)
}
