// the review smoke's checks of what a later Scan reviews again: none of the pages that the Topic's limit removed,
// exactly the removed pages that changed, and everything after an edited prompt, with the live feed ingest they share

import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { filteredFindings, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { loadResourcesToReview } from "@carlnotes/pipeline/review/filter"
import { loadScan } from "@carlnotes/pipeline/scan"
import { and, desc, eq, inArray } from "drizzle-orm"
import { finishScan, type IngestStageResult, ingestForScan, reviewForScan } from "./workflows/runTopicScanActivities"

// a topic context that matches the smoke's feed
export const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

/**
 * Checks on a full topic that a scan scores no page that the limit removed while its filtered finding holds, and
 * scores exactly the removed pages that changed.
 */
export async function checkFilteredFindings(topicId: string, ownerId: string): Promise<boolean> {
	console.log("\n=== 2. the pages that the limit removed ===")

	// the first scan filled the topic and removed the rest, each leaving a filtered finding
	const firstFindings = await db
		.select({ id: findings.id, scanId: findings.scanId })
		.from(findings)
		.where(eq(findings.topicId, topicId))
	const filteredPagesAfterFirstScan = await loadFilteredPages(topicId)
	console.log(`after scan 1: ${firstFindings.length} findings, ${filteredPagesAfterFirstScan.length} filtered findings`)

	// an unchanged prompt scores none of them, and leaves every finding that survives its filter as scan 1 wrote it
	const unchangedPromptScan = await scanAgain(topicId, ownerId)
	const filteredIdsAfterFirstScan = new Set(filteredPagesAfterFirstScan.map((filteredPage) => filteredPage.resourceId))
	const rescoredFilteredIds = unchangedPromptScan.scoredResourceIds.filter((id) => filteredIdsAfterFirstScan.has(id))

	// the findings of scan 1 that the second filter kept, each beside the scan that last reviewed it
	const survivingFindings = await db
		.select({ id: findings.id, scanId: findings.scanId })
		.from(findings)
		.where(inArray(findings.id, firstFindings.map((firstFinding) => firstFinding.id).concat("none")))
	const firstScanIdByFindingId = new Map(firstFindings.map((firstFinding) => [firstFinding.id, firstFinding.scanId]))
	const isEverySurvivorUntouched = survivingFindings.every(
		(survivingFinding) => firstScanIdByFindingId.get(survivingFinding.id) === survivingFinding.scanId,
	)
	console.log(
		`scan 2, prompt unchanged: scored ${unchangedPromptScan.scoredCount}, ${rescoredFilteredIds.length} of them removed before, cost $${unchangedPromptScan.cost.toFixed(4)}`,
	)

	// three removed pages change, one way each, and the next scan scores exactly those three of the removed pages
	const filteredPagesBeforeThirdScan = await loadFilteredPages(topicId)
	const changedFilteredPages = await changeFilteredPages(topicId, ownerId, filteredPagesBeforeThirdScan)
	const changedPageScan = await scanAgain(topicId, ownerId)
	const filteredIdsBeforeThirdScan = new Set(
		filteredPagesBeforeThirdScan.map((filteredPage) => filteredPage.resourceId),
	)
	const scoredFilteredIds = changedPageScan.scoredResourceIds
		.filter((id) => filteredIdsBeforeThirdScan.has(id))
		.toSorted()
	const changedIds = Object.values(changedFilteredPages).map((filteredPage) => filteredPage.resourceId)
	console.log(
		`scan 3, three pages changed: scored ${changedPageScan.scoredCount}, ${scoredFilteredIds.length} of them removed before, cost $${changedPageScan.cost.toFixed(4)}`,
	)

	// the rated chapter's page got a Finding that holds the chapter's rating, and the chapter is its Finding's now
	const { ratedChapterPage } = changedFilteredPages
	const [ratedChapterFinding] = await db
		.select({ id: findings.id, rating: findings.rating })
		.from(findings)
		.where(and(eq(findings.topicId, topicId), eq(findings.resourceId, ratedChapterPage.resourceId)))

	// the chapter of the smoke's own podcast episode, which the new Finding linked
	const [ratedChapter] = await db
		.select({ findingId: podcastEpisodeChapters.findingId, rating: podcastEpisodeChapters.rating })
		.from(podcastEpisodeChapters)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, podcastEpisodeChapters.podcastEpisodeId))
		.where(
			and(eq(podcastEpisodes.topicId, topicId), eq(podcastEpisodeChapters.resourceId, ratedChapterPage.resourceId)),
		)

	// a scored page's filtered finding is gone, unless the filter removed its new Finding again
	const filteredIdsAfterThirdScan = new Set(
		(await loadFilteredPages(topicId)).map((filteredPage) => filteredPage.resourceId),
	)
	const findingResourceRows = await db
		.select({ resourceId: findings.resourceId })
		.from(findings)
		.where(eq(findings.topicId, topicId))
	const hasFindingAndFilteredFinding = findingResourceRows.some(({ resourceId }) =>
		filteredIdsAfterThirdScan.has(resourceId),
	)

	const results: [string, boolean][] = [
		["the first scan left a filtered finding for the pages its limit removed", filteredPagesAfterFirstScan.length >= 3],
		["an unchanged prompt scores no page that the limit removed", rescoredFilteredIds.length === 0],
		["an unchanged prompt leaves every surviving finding alone", isEverySurvivorUntouched],
		[
			"changed content, a url Source, and a rated chapter each send their page back, and no other removed page",
			scoredFilteredIds.join() === changedIds.toSorted().join(),
		],
		["the rated chapter's page has a finding with the chapter's rating", ratedChapterFinding?.rating === "up"],
		[
			"the chapter is linked to that finding and holds no rating of its own",
			ratedChapter?.findingId === ratedChapterFinding?.id && ratedChapter?.rating === null,
		],
		["no page has both a finding and a filtered finding", !hasFindingAndFilteredFinding],
	]
	let isTestPassing = true
	for (const [label, isPassed] of results) {
		console.log(`${isPassed ? "PASS" : "FAIL"}  ${label}`)
		isTestPassing = isTestPassing && isPassed
	}
	return isTestPassing
}

/**
 * Checks that a scan reviews a finding again only if the question it was reviewed against changed.
 */
export async function checkReviewAgain(topicId: string, ownerId: string): Promise<boolean> {
	console.log("\n=== 3. reviewing again ===")

	// read the findings the earlier scans wrote, and rate one to prove a re-score leaves it alone
	const firstFindings = await db
		.select({ id: findings.id, scanId: findings.scanId, reviewedContextHash: findings.reviewedContextHash })
		.from(findings)
		.where(eq(findings.topicId, topicId))
	// the first finding takes a rating and views, which the re-score must leave alone
	const ratedFinding = firstFindings[0]
	if (!ratedFinding) {
		console.log("FAIL  the earlier scans wrote no finding to review again")
		return false
	}
	await db.update(findings).set({ rating: "up", viewCount: 3 }).where(eq(findings.id, ratedFinding.id))
	console.log(`findings before the edit : ${firstFindings.length}`)

	// whether a surviving finding still names the scan that reviewed it
	const isStillReviewedBy = async (findingId: string, scanId: string): Promise<boolean> => {
		const [row] = await db.select({ scanId: findings.scanId }).from(findings).where(eq(findings.id, findingId))
		return row?.scanId === scanId
	}

	// ask the selector what a scan with nothing discovered would review. a bookmarked or rated finding
	// outlives the feed it came from
	const resourcesToReview = await loadResourcesToReview({
		topicId,
		discoveredResources: [],
		topicContextHash: "a-context-nothing-was-reviewed-against",
	})
	const resourceIdsToReview = new Set(resourcesToReview.map((resource) => resource.id))
	// the rated finding's resource, which the resources to review must include
	const [ratedResource] = await db
		.select({ id: resources.id })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.id, ratedFinding.id))
	const isRatedResourceToReview = ratedResource !== undefined && resourceIdsToReview.has(ratedResource.id)
	console.log(`  the rated finding's resource is still to review with nothing discovered: ${isRatedResourceToReview}`)

	// an edited prompt asks a different question, so every surviving finding is reviewed again, and so are the pages
	// that the limit removed, whose filtered findings hold no longer
	const filteredIdsBeforeEdit = new Set(
		(await loadFilteredPages(topicId)).map((filteredPage) => filteredPage.resourceId),
	)
	await db
		.update(topics)
		.set({ prompt: `${TOPIC_CONTEXT} Focus on evaluation and testing above all.` })
		.where(eq(topics.id, topicId))

	// the scan after the edit, and how many of the pages it scored were removed before it
	const editedPromptScan = await scanAgain(topicId, ownerId)
	const isReviewedAgain = !(await isStillReviewedBy(ratedFinding.id, ratedFinding.scanId))
	const rescoredFilteredCount = editedPromptScan.scoredResourceIds.filter((id) => filteredIdsBeforeEdit.has(id)).length
	console.log(
		`scan 4, prompt edited   : scored ${editedPromptScan.scoredCount}, ${rescoredFilteredCount} of them removed before, cost $${editedPromptScan.cost.toFixed(4)}`,
	)
	console.log(`  the rated finding was reviewed again: ${isReviewedAgain}`)

	// what the review did to the rated finding
	const [ratedFindingAfterEdit] = await db
		.select({
			rating: findings.rating,
			viewCount: findings.viewCount,
			reviewedContextHash: findings.reviewedContextHash,
		})
		.from(findings)
		.where(eq(findings.id, ratedFinding.id))

	const results: [string, boolean][] = [
		[
			"every finding holds the hash it was reviewed against",
			firstFindings.every((row) => row.reviewedContextHash !== null),
		],
		["an edited prompt reviews a surviving finding again", isReviewedAgain],
		["an edited prompt sends pages that the limit removed back to the model", rescoredFilteredCount > 0],
		["a finding the scan never rediscovers is still reviewed", isRatedResourceToReview],
		["the rated finding survived the review", ratedFindingAfterEdit !== undefined],
		["the rating survived", ratedFindingAfterEdit?.rating === "up"],
		["the view count survived", ratedFindingAfterEdit?.viewCount === 3],
		[
			"the finding reviewed again has a new hash",
			ratedFindingAfterEdit?.reviewedContextHash !== ratedFinding.reviewedContextHash,
		],
	]
	let isTestPassing = true
	for (const [label, isPassed] of results) {
		console.log(`${isPassed ? "PASS" : "FAIL"}  ${label}`)
		isTestPassing = isTestPassing && isPassed
	}
	return isTestPassing
}

// what one more scan of the seeded topic reviewed: the Resources it scored, and what it cost
type ScanAgainResult = { scoredResourceIds: string[]; scoredCount: number; cost: number }

/**
 * Scans the seeded topic again and reports what that pass reviewed.
 */
async function scanAgain(topicId: string, ownerId: string): Promise<ScanAgainResult> {
	// the row is marked dispatched, so a schedule sweep sharing the database never starts it a second time
	const [smokeScan] = await db.insert(scans).values({ topicId, ownerId, dispatchedAt: new Date() }).returning()
	if (!smokeScan) {
		throw new Error("could not open the second scan")
	}
	// drive the stages in order, then read back what the closing stage wrote
	const ingestResult = await ingestLiveFeed(smokeScan.id, topicId)
	const reviewResult = await reviewForScan(smokeScan.id, topicId, ownerId, ingestResult, ingestResult.budget)
	await finishScan(smokeScan.id, topicId, ownerId, ingestResult, reviewResult)
	const topicScan = await loadScan(smokeScan.id)
	return {
		scoredResourceIds: reviewResult.review.scoredResourceIds,
		scoredCount: reviewResult.review.scoredResourceIds.length,
		cost: Number(topicScan?.cost ?? 0),
	}
}

// how many times the smoke ingests the live feed before it counts a timed-out feed as a failed Scan
const INGEST_ATTEMPTS = 3

/**
 * Ingests the smoke topic's feed, trying again while the feed fails. Ingest is safe to run again, and a live feed can
 * time out on one read.
 */
export async function ingestLiveFeed(scanId: string, topicId: string): Promise<IngestStageResult> {
	let ingestResult = await ingestForScan(scanId, topicId)
	for (let attempt = 1; attempt < INGEST_ATTEMPTS && ingestResult.status === "failed"; attempt++) {
		console.log(`the feed failed on attempt ${attempt}, ingesting again`)
		ingestResult = await ingestForScan(scanId, topicId)
	}
	return ingestResult
}

// a page whose Finding the topic's limit removed: its Resource, its url, and the score it was removed at
type FilteredPage = { resourceId: string; url: string; relevanceScore: number }

// the topic's filtered findings, best scored first
async function loadFilteredPages(topicId: string): Promise<FilteredPage[]> {
	return db
		.select({
			resourceId: filteredFindings.resourceId,
			url: resources.url,
			relevanceScore: filteredFindings.relevanceScore,
		})
		.from(filteredFindings)
		.innerJoin(resources, eq(filteredFindings.resourceId, resources.id))
		.where(eq(filteredFindings.topicId, topicId))
		.orderBy(desc(filteredFindings.relevanceScore))
}

// the three filtered pages that the third scan must score, each for its own change, and the chapter that holds a rating
type ChangedFilteredPages = {
	changedContentPage: FilteredPage
	urlSourcePage: FilteredPage
	ratedChapterPage: FilteredPage
}

// change three filtered pages, one way each, so that the next scan sends exactly those three back to the model: other
// content than the page was scored against, a url Source that names the page, and a rating on a chapter whose
// Finding is gone
async function changeFilteredPages(
	topicId: string,
	ownerId: string,
	filteredPages: FilteredPage[],
): Promise<ChangedFilteredPages> {
	const [changedContentPage, urlSourcePage, ratedChapterPage] = filteredPages
	if (!changedContentPage || !urlSourcePage || !ratedChapterPage) {
		throw new Error(`the topic holds ${filteredPages.length} filtered findings, and the smoke changes three`)
	}

	// the first page's stored content hash no longer matches the one it was scored against
	await db
		.update(resources)
		.set({ contentHash: "changed-by-the-review-smoke" })
		.where(eq(resources.id, changedContentPage.resourceId))

	// the second page is a url Source's own page, which every scan reads
	await db.insert(sources).values({ topicId, kind: "url", config: { url: urlSourcePage.url }, status: "ready" })

	// the third page was narrated by a chapter that a user rated after its Finding was removed
	const [podcastEpisode] = await db
		.insert(podcastEpisodes)
		.values({ topicId, ownerId, status: "published", title: "review smoke" })
		.returning({ id: podcastEpisodes.id })
	if (!podcastEpisode) {
		throw new Error("could not seed the podcast episode whose chapter is rated")
	}
	await db.insert(podcastEpisodeChapters).values({
		...{ podcastEpisodeId: podcastEpisode.id, position: 0, resourceId: ratedChapterPage.resourceId },
		...{ title: "a rated chapter", sourceUrl: ratedChapterPage.url, rating: "up", startSeconds: 0, endSeconds: 1 },
	})
	return { changedContentPage, urlSourcePage, ratedChapterPage }
}
