// the Scan pipeline as three activities: ingest, review, and the write that completes the Scan

import { toTopicPath } from "@carlnotes/contracts/seo"
import type { StoredScanSourceResults, StoredSourceResult } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { type Budget, newBudget, toCheckpointBudget, toResumedBudget } from "@carlnotes/models/budget"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { notifyIndexNow } from "@carlnotes/pipeline/indexNow"
import { ingestFromTopicSources, toScannedSource } from "@carlnotes/pipeline/ingest/index"
import type { DiscoveredResource } from "@carlnotes/pipeline/ingest/ingester"
import { saveTopicVectors } from "@carlnotes/pipeline/meanVectors"
import type { ReviewSummary } from "@carlnotes/pipeline/review/index"
import { reviewScan } from "@carlnotes/pipeline/review/index"
import type { ScannedSource } from "@carlnotes/pipeline/review/summarize"
import { HEARTBEAT_INTERVAL_MS } from "@carlnotes/pipeline/stageTimeouts"
import { trackEvent } from "@carlnotes/server/analytics"
import { appBaseUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing"
import { ApplicationFailure, asyncLocalStorage } from "@temporalio/activity"
import { and, count, eq, isNull } from "drizzle-orm"

// a persisted Scan row, and the aggregate that ingest hands to review
type Scan = typeof scans.$inferSelect

// what ingest leaves for the stages after it
export type IngestStageResult = {
	resources: DiscoveredResource[]
	foundCount: number
	status: Scan["status"]
	problemSources: Scan["problemSources"]
	// each Source's outcome as the scan report reads it, and each Source's result. a payload from a worker before
	// source results has none
	sourceOutcomes: ScannedSource[]
	sourceResults?: StoredSourceResult[]
	budget: Budget
}

// what review leaves for the write that completes the Scan
export type ReviewStageResult = { review: ReviewSummary; budget: Budget }

/**
 * Ingest every Source on the Topic and store what they turned up. Safe to run again: Resources dedupe on canonical url,
 * so a second ingest attempt reaches the same set of resources instead of ingesting again.
 */
export async function ingestForScan(scanId: string, topicId: string): Promise<IngestStageResult> {
	// record when a worker first picks up the Scan. a retried ingest keeps the first attempt's time
	await db
		.update(scans)
		.set({ pickedUpAt: new Date() })
		.where(and(eq(scans.id, scanId), isNull(scans.pickedUpAt)))

	// run no Source for a Scan that is already marked failed.
	// throw the Scan's own failure reason as a failure that Temporal does not retry
	const scan = await requireScan(scanId)
	if (scan.status === "failed") {
		throw ApplicationFailure.nonRetryable(scan.error ?? "the scan was already marked failed", "ScanAlreadyFailed")
	}

	// create the LiteLLM key of the Scan's owner if the owner has none, before any Source runs.
	// the Scan fails before spending on ingest if the proxy cannot create the key
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(scan.ownerId)

	// the Budget is made here instead of in the workflow
	const budget = toStageBudget(newBudget())
	return traceScanStage("scan-ingest", scanId, topicId, () =>
		withHeartbeat(budget, async () => {
			// every later stage charges into the budget this returns ingestion runs every Source at once
			const { sourceOutcomes, summary } = await ingestFromTopicSources({ topicId, budget, litellmApiKey })
			await recordScanProgress(scanId, budget)
			// drop the fetched page bodies and each Source's own Resources before the result crosses the activity boundary
			return {
				resources: summary.resources.map(({ fetchedBody, ...resource }) => resource),
				foundCount: summary.foundCount,
				status: summary.status,
				problemSources: summary.problemSources,
				sourceOutcomes: sourceOutcomes.map(toScannedSource),
				sourceResults: summary.sourceResults,
				budget,
			}
		}),
	)
}

/**
 * Review what ingest found, paying for the fetches and the model calls it needs.
 * A second attempt skips every Resource the first one already scored, and resumes with what it spent.
 */
export async function reviewForScan(
	scanId: string,
	topicId: string,
	ownerId: string,
	ingestResult: IngestStageResult,
	budget: Budget,
): Promise<ReviewStageResult> {
	// what the last attempt had spent when it died, or what ingestion handed over on the first attempt
	const stageBudget = toStageBudget(budget)
	return traceScanStage("scan-review", scanId, topicId, () =>
		withHeartbeat(stageBudget, async () => {
			// the Scan row and the owner's LiteLLM proxy key
			const scan = await requireScan(scanId)
			const litellmApiKey = await loadOrProvisionUserLiteLLMKey(ownerId)

			const review = await reviewScan(
				scan,
				topicId,
				ingestResult.resources,
				ingestResult.sourceOutcomes,
				stageBudget,
				litellmApiKey,
				stopSignal(),
			)
			await recordScanProgress(scanId, stageBudget)
			return { review, budget: stageBudget }
		}),
	)
}

/**
 * Finishes the Scan by storing its counts and cost, saving its topic's vectors, and telling IndexNow if a public topic
 * gained or lost a finding.
 */
export async function finishScan(
	scanId: string,
	topicId: string,
	ownerId: string,
	ingestResult: IngestStageResult,
	reviewResult: ReviewStageResult,
): Promise<void> {
	const { review, budget } = reviewResult

	// what the Scan kept, read once from its own Findings instead of from the review, so the kept count and each
	// Source's kept count agree
	const keptFindingRows = await db
		.select({ url: resources.url })
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.where(eq(findings.scanId, scanId))
	const keptFindingUrls = keptFindingRows.map((keptFindingRow) => keptFindingRow.url)

	// what the review read again from the topic's earlier findings. a review from a worker before this count read none
	const earlierFoundCount = review.earlierFoundCount ?? 0

	// each Source's kept count beside its result, or null for a payload from a worker before source results
	const sourceResults = ingestResult.sourceResults
		? toScanSourceResults({
				ingestSourceResults: ingestResult.sourceResults,
				discoveredResources: ingestResult.resources,
				keptFindingUrls,
				earlierFoundCount,
			})
		: null

	// the write completes the Scan: what ingestion found and review read again, what review kept, each Source's result,
	// the per-stage costs, and the total
	const [finishedScan] = await db
		.update(scans)
		.set({
			status: ingestResult.status,
			foundCount: ingestResult.foundCount + earlierFoundCount,
			problemSources: ingestResult.problemSources,
			keptCount: keptFindingUrls.length,
			sourceResults,
			filteredCount: review.filteredCount,
			stageCosts: budget.stageCosts,
			scanSummary: review.scanSummary,
			reused: budget.fetchCounts.reusedCount,
			revalidated: budget.fetchCounts.revalidatedCount,
			fetched: budget.fetchCounts.fetchedCount,
			cost: budget.spentDollars.toString(),
			finishedAt: new Date(),
			// the sweep that marks a hung Scan failed writes its reason here, so a Scan that finishes afterward clears it
			error: null,
		})
		.where(eq(scans.id, scanId))
		.returning()
	if (!finishedScan) {
		return
	}

	// save the topic's vectors from what the scan kept
	await saveTopicVectorsAfterScan({ scanId, topicId })

	// load the topic for the analytics and the IndexNow notification, and stop if the topic was deleted
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return
	}

	// report the scan with the owner's plan, and the owner's first succeeded scan once
	const [topicOwner] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, ownerId))
	const scanAnalyticsProperties = {
		entryPoint: "worker",
		plan: topicOwner?.plan ?? "free",
		topicId,
		isTopicPublic: topic.visibility === "public",
	}
	trackEvent("scan_completed", ownerId, {
		...scanAnalyticsProperties,
		trigger: finishedScan.isManual ? "manual" : "scheduled",
		findingsKept: finishedScan.keptCount,
		status: finishedScan.status,
	})
	if (ingestResult.status === "succeeded" && (await isFirstSucceededScan(ownerId))) {
		trackEvent("first_scan_completed", ownerId, scanAnalyticsProperties)
	}

	// tell IndexNow a public topic's page changed if a finding was added or filtered out
	const appUrl = appBaseUrl()
	if (appUrl && topic.visibility === "public" && review.addedOrFilteredFindingCount > 0) {
		await notifyIndexNow([`${appUrl}${toTopicPath(topic)}`])
	}
}

// a Source's result as ingest returns it, the Resources the Scan discovered, and the urls of the Scan's kept Findings
type ToScanSourceResultsOptions = {
	ingestSourceResults: StoredSourceResult[]
	discoveredResources: DiscoveredResource[]
	keptFindingUrls: string[]
	// the Resources the review read again from the topic's earlier findings, which no Source returned this Scan
	earlierFoundCount: number
}

/**
 * Counts each kept Finding for the Source credited with its Resource, or as earlier if no Source returned it this Scan,
 * beside the earlier Resources the review read again.
 */
export function toScanSourceResults({
	ingestSourceResults,
	discoveredResources,
	keptFindingUrls,
	earlierFoundCount,
}: ToScanSourceResultsOptions): StoredScanSourceResults {
	// the Source each discovered url is credited to
	const sourceIdByUrl = new Map(discoveredResources.map((resource) => [resource.url, resource.sourceId]))

	// the kept count of each Source, and of the findings from earlier scans
	const keptCountBySourceId = new Map<string, number>()
	let earlierKeptCount = 0

	// count each kept url for its Source, or as earlier if this Scan discovered no such url
	for (const keptFindingUrl of keptFindingUrls) {
		const sourceId = sourceIdByUrl.get(keptFindingUrl)
		if (sourceId === undefined) {
			earlierKeptCount += 1
			continue
		}
		keptCountBySourceId.set(sourceId, (keptCountBySourceId.get(sourceId) ?? 0) + 1)
	}

	// put each Source's kept count on its result
	const sourceResults = ingestSourceResults.map((sourceResult) => ({
		...sourceResult,
		keptCount: keptCountBySourceId.get(sourceResult.sourceId) ?? 0,
	}))
	return { sources: sourceResults, earlierKeptCount, earlierFoundCount }
}

/**
 * Close a Scan the user stopped, keeping what it managed to keep. It saves as succeeded instead of failed,
 * because its Findings are real and its cost is owed. The stoppedAt timestamp is what gives its daily scan back
 * and what tells the topic page it was stopped.
 * Nothing is emailed: a manual Scan reports to the page whoever stopped it is watching, and a scheduled
 * one sends no digest for a Topic read only part way.
 * The spend is left as each stage recorded it. A cancelled stage's own totals never reach the workflow. The topic's
 * vectors are saved from what the Scan kept.
 */
export async function stopScan(scanId: string): Promise<void> {
	// the Scan saves the moment the stop arrives, while its cancelled stage is still winding down
	const [stoppedScan] = await db
		.update(scans)
		.set({ status: "succeeded", stoppedAt: new Date(), finishedAt: new Date() })
		.where(and(eq(scans.id, scanId), isNull(scans.finishedAt)))
		.returning({ topicId: scans.topicId })

	// save the topic's vectors from what the stopped scan kept
	if (stoppedScan?.topicId) {
		await saveTopicVectorsAfterScan({ scanId, topicId: stoppedScan.topicId })
	}
}

/**
 * Record what a stage spent and what the Scan has kept, as that stage ends. A Scan that runs to the end overwrites
 * this with its final totals, but a Scan the user stops never gets that far: the workflow drops its cancelled stage's
 * return value, and saves the row before the stage has finished. Saving from inside the stage is what
 * gets the real spend and the real kept count onto a stopped Scan.
 */
async function recordScanProgress(scanId: string, budget: Budget): Promise<void> {
	// the Findings are the count, the same source a Scan that runs to the end counts from
	const [keptRow] = await db.select({ count: count() }).from(findings).where(eq(findings.scanId, scanId))
	await db
		.update(scans)
		.set({
			keptCount: keptRow?.count ?? 0,
			stageCosts: budget.stageCosts,
			cost: budget.spentDollars.toString(),
			reused: budget.fetchCounts.reusedCount,
			revalidated: budget.fetchCounts.revalidatedCount,
			fetched: budget.fetchCounts.fetchedCount,
		})
		.where(eq(scans.id, scanId))
}

/**
 * Reports a Scan whose email workflow could not be started. The Scan is already complete, so nothing else changes.
 */
export async function reportScanEmailNotStarted(scanId: string, reason: string): Promise<void> {
	console.error(`the email workflow for scan ${scanId} could not be started: ${reason}`)
	reportError(new Error("a scan email workflow could not be started"), "email", { scanId, reason })
}

/**
 * Reports a Scan whose podcast episode workflow could not be started.
 * The Scan is already complete, so nothing else changes.
 */
export async function reportPodcastEpisodeRecordingNotStarted(scanId: string, reason: string): Promise<void> {
	console.error(`the episode workflow for scan ${scanId} could not be started: ${reason}`)
	reportError(new Error("an episode workflow could not be started"), "podcast-episode", { scanId, reason })
}

/**
 * Record a Scan as failed along with what it had already spent, for a workflow whose stage threw an error, and save
 * the topic's vectors from what the Scan kept before it failed.
 */
export async function failScan(scanId: string, reason: string, budget?: Budget): Promise<void> {
	// a Scan that failed before its first stage returned has no spend to record
	const spend = budget ? { stageCosts: budget.stageCosts, cost: budget.spentDollars.toString() } : {}
	const [failedScan] = await db
		.update(scans)
		.set({ status: "failed", error: reason, finishedAt: new Date(), ...spend })
		.where(eq(scans.id, scanId))
		.returning({ topicId: scans.topicId })

	// save the topic's vectors from what the failed scan kept before its stage threw
	if (failedScan?.topicId) {
		await saveTopicVectorsAfterScan({ scanId, topicId: failedScan.topicId })
	}
}

// the scan that ended, and its topic
type SaveTopicVectorsAfterScanOptions = { scanId: string; topicId: string }

// save the topic's vectors after a scan ends. a failed save is reported and never fails the scan
async function saveTopicVectorsAfterScan({ scanId, topicId }: SaveTopicVectorsAfterScanOptions): Promise<void> {
	await saveTopicVectors(topicId).catch((error: unknown) => reportError(error, "database", { scanId, topicId }))
}

// report that this worker is alive for as long as the stage runs, and checkpoint the Budget's settled spend as what it
// reports
function withHeartbeat<Result>(budget: Budget, runStage: () => Promise<Result>): Promise<Result> {
	const activityContext = asyncLocalStorage.getStore()
	const heartbeatPump = setInterval(() => activityContext?.heartbeat(toCheckpointBudget(budget)), HEARTBEAT_INTERVAL_MS)
	return runStage().finally(() => clearInterval(heartbeatPump))
}

// the signal that aborts when the user stops the Scan
function stopSignal(): AbortSignal | undefined {
	return asyncLocalStorage.getStore()?.cancellationSignal
}

// the Budget this attempt runs against
function toStageBudget(passedBudget: Budget): Budget {
	return toResumedBudget(asyncLocalStorage.getStore()?.info.heartbeatDetails, passedBudget)
}

// one llm trace per stage
function traceScanStage<Result>(
	stage: string,
	scanId: string,
	topicId: string,
	runStage: () => Promise<Result>,
): Promise<Result> {
	return propagateAttributes({ traceName: stage, metadata: { topicId, scanId } }, () =>
		startActiveObservation(stage, runStage),
	)
}

// the Scan row this workflow is running, read fresh instead of being passed across a stage
async function requireScan(scanId: string): Promise<Scan> {
	const [scan] = await db.select().from(scans).where(eq(scans.id, scanId))
	if (!scan) {
		throw new Error(`scan ${scanId} no longer exists`)
	}
	return scan
}

// whether the Scan that just finished is this owner's first Scan to succeed
async function isFirstSucceededScan(ownerId: string): Promise<boolean> {
	const [scanCountRow] = await db
		.select({ count: count() })
		.from(scans)
		.where(and(eq(scans.ownerId, ownerId), eq(scans.status, "succeeded")))
	return scanCountRow?.count === 1
}
