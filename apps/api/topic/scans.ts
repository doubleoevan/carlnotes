// starting a Scan by hand, the routes that start and stop one, and one Scan's recap and source results

import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import { toSourceResultLabel, toUrlHost } from "@carlnotes/contracts/sources"
import {
	type ScanNote,
	type ScanSourceResults,
	type SourceResult,
	type StoredSourceResult,
	storedScanSourceResults,
} from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { isManualScanWaiting, isTopicFirstScanWaiting } from "@carlnotes/db/dailySpendCutoffs"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { isUserLiteLLMKeyBudgetExhausted } from "@carlnotes/models/litellm"
import { loadScan, startTopicScan } from "@carlnotes/pipeline/scan"
import { failStaleScans } from "@carlnotes/pipeline/staleScans"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed, loadManualScanAuthorization, loadMonthlyBudgetCutoffStatus } from "../authorization"
import { reportManualScanOverage } from "../billing"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { stopManualScan } from "./stopManualScan"

// what a start or a stop returns if Temporal is unavailable
const SCAN_UNAVAILABLE_ERROR = "scanning is temporarily unavailable, try again in a minute"

// the outcomes of a manual scan request. status: running means a scan is already running for the topic.
// status: budget means the user's monthly budget, or the key that the scan bills, is spent
// status: paused means the user's monthly spend is past the manual scans cutoff and short of the whole budget
// status: unavailable means handing the scan to Temporal threw
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ManualScanResult = { status: "started"; remainingScans: number } | { status: "forbidden" } | { status: "quota" } | { status: "budget" } | { status: "paused" } | { status: "running" } | { status: "unavailable" }

// whether the caller's request may bill as an overage past the daily quota
type RunManualScanOptions = { isOverageAllowed?: boolean }

/**
 * Starts a manual scan for the owner or an admin. The scan runs without blocking the request.
 * Enforces the daily quota, the spent monthly budget, the manual scans cutoff, and the budget of the key that the scan
 * bills. A manual scan that the first scan dispatch limit applies to opens for the sweep to start.
 */
export async function runManualScan(
	userId: string,
	topicId: string,
	analyticsProperties: AnalyticsProperties,
	{ isOverageAllowed = true }: RunManualScanOptions = {},
): Promise<ManualScanResult> {
	// load the topic, then let the gate decide authority (owner or admin) and the daily quota together
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return { status: "forbidden" }
	}
	const authorization = await loadManualScanAuthorization(userId, topic)
	if (authorization.status !== "allowed") {
		// track the paywall event. the owner triggered another scan without a card on file to bill the overage to
		if (authorization.status === "quota") {
			trackEvent("scan_quota_reached", userId, { ...analyticsProperties, topicId })
		}
		return authorization
	}

	// a caller that may not bill an overage stops at the quota, even with a card on file
	if (authorization.isOverage && !isOverageAllowed) {
		trackEvent("scan_quota_reached", userId, { ...analyticsProperties, topicId })
		return { status: "quota" }
	}

	// reject the scan if the user's monthly budget is spent or their spend is past the manual scans cutoff. both
	// rejections come before any scan row or overage
	const monthlyBudgetCutoffStatus = await loadMonthlyBudgetCutoffStatus(userId, "manualScans")
	if (monthlyBudgetCutoffStatus !== "allowed") {
		return { status: monthlyBudgetCutoffStatus }
	}

	// reject the scan if the user's LiteLLM key, which the scan bills, has spent its budget. a failed key read starts
	// the scan
	if (await isUserLiteLLMKeyBudgetExhausted(userId)) {
		return { status: "budget" }
	}

	// close out any hung scans first, so a stuck scan row doesn't block a new manual scan indefinitely
	await failStaleScans()

	// a waiting first Scan, or a free user's manual Scan past the scheduled scans cutoff, waits for the sweep
	const saveWaitingManualScanResult = await saveWaitingManualScan({
		topic,
		userId,
		remainingScans: authorization.remainingScans,
	})
	if (saveWaitingManualScanResult?.status === "started") {
		trackEvent("scan_requested", userId, { ...analyticsProperties, topicId })
	}
	if (saveWaitingManualScanResult) {
		return saveWaitingManualScanResult
	}

	// hand the scan to Temporal, and report a start that throws as unavailable
	const startTopicScanResult = await startTopicScan(topicId, userId, "manual").catch((error: unknown) => {
		console.error(`manual scan could not start for topic ${topicId}`, error)
		reportError(error, "manual-scan", { topicId, userId })
		return null
	})

	// return an unavailable start, then a Scan already running
	if (startTopicScanResult === null) {
		return { status: "unavailable" }
	}
	if (startTopicScanResult.status === "running") {
		return { status: "running" }
	}

	// an overage bills only once the scan finished
	startTopicScanResult
		.whenFinished()
		.then(async () => {
			// a Scan the user stopped gave its daily scan back, so the limit the overage bills for is no longer exceeded
			const finishedScan = await loadScan(startTopicScanResult.scan.id)
			if (authorization.isOverage && !finishedScan?.stoppedAt) {
				await reportManualScanOverage(userId)
			}
		})
		// report a failed scan and its error
		.catch((error) => {
			console.error(`manual scan failed for topic ${topicId}`, error)
			reportError(error, "manual-scan", { topicId, userId })
		})

	// track the scan request analytics event, then return the quota that the user has left
	trackEvent("scan_requested", userId, { ...analyticsProperties, topicId })
	return { status: "started", remainingScans: authorization.remainingScans }
}

// the Topic, the user that the manual Scan bills, and the quota they have left
type SaveWaitingManualScanOptions = { topic: typeof topics.$inferSelect; userId: string; remainingScans: number }

// the result of a manual Scan that waits for the first scan dispatch limit, or null to start it now.
// a Topic whose first Scan waits returns running and leaves that row alone. past the scheduled scans cutoff, a free
// user's manual Scan saves a manual row that the sweep starts, or returns running if the Topic has a running Scan
async function saveWaitingManualScan({
	topic,
	userId,
	remainingScans,
}: SaveWaitingManualScanOptions): Promise<ManualScanResult | null> {
	// return running for a Topic whose first Scan waits, and null for a manual Scan that does not wait
	if (await isTopicFirstScanWaiting(topic)) {
		return { status: "running" }
	}
	if (!(await isManualScanWaiting(userId))) {
		return null
	}

	// save the manual row under the Topic's lock, so two requests at once save one row
	const isManualRowSaved = await db.transaction(async (transaction) => {
		await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`waiting-manual-scan:${topic.id}`}))`)

		// a Topic with a running Scan already has the Scan the user asked for
		const [runningScan] = await transaction
			.select({ id: scans.id })
			.from(scans)
			.where(and(eq(scans.topicId, topic.id), eq(scans.status, "running")))
			.limit(1)
		if (runningScan) {
			return false
		}

		// save the manual row without a workflow
		await transaction.insert(scans).values({ topicId: topic.id, ownerId: userId, isManual: true })
		return true
	})
	return isManualRowSaved ? { status: "started", remainingScans } : { status: "running" }
}

/**
 * Returns a scan note's source results from the stored value, or null if the value is missing or malformed.
 */
export function toSourceResultsView(storedValue: unknown, canViewOwnerDetails: boolean): ScanSourceResults | null {
	// a missing value, or one that no longer matches the stored shape, returns no results
	const storedScanSourceResultsResult = storedScanSourceResults.safeParse(storedValue)
	if (!storedScanSourceResultsResult.success) {
		return null
	}

	// keep the statuses the wire shape names, so a skipped Source and any later status never leave the api
	const { sources, earlierKeptCount, earlierFoundCount } = storedScanSourceResultsResult.data
	const sourceResults = sources.flatMap((storedSourceResult) => {
		const sourceResult = toSourceResultView(storedSourceResult, canViewOwnerDetails)
		return sourceResult ? [sourceResult] : []
	})
	return { sources: sourceResults, earlierKeptCount, earlierFoundCount }
}

// one stored source result as a scan note returns it, copied field by field, or null for a status the note leaves out
function toSourceResultView(storedSourceResult: StoredSourceResult, canViewOwnerDetails: boolean): SourceResult | null {
	if (["ai_agent", "email"].includes(storedSourceResult.sourceKind)) {
		return null
	}
	// the fields every result has. everyone but the owner and admins reads a url Source by its host
	const isUrlHostLabel = storedSourceResult.sourceKind === "url" && !canViewOwnerDetails
	const sourceResultFields = {
		sourceId: storedSourceResult.sourceId,
		sourceKind: storedSourceResult.sourceKind,
		label: isUrlHostLabel
			? (toUrlHost(storedSourceResult.label) ?? toSourceResultLabel("url", {}))
			: storedSourceResult.label,
		foundCount: storedSourceResult.foundCount,
		keptCount: storedSourceResult.keptCount,
		costDollars: canViewOwnerDetails ? storedSourceResult.costDollars : null,
		durationMs: storedSourceResult.durationMs,
	}

	// add each status's own detail
	switch (storedSourceResult.status) {
		case "ok":
			return { ...sourceResultFields, status: "ok" }
		case "fallback":
			return { ...sourceResultFields, status: "fallback", fallbackMode: storedSourceResult.fallbackMode }
		// a failure reason goes to the owner and admins alone
		case "failed":
			return { ...sourceResultFields, status: "failed", reason: canViewOwnerDetails ? storedSourceResult.reason : null }
		// a skipped Source, and any status this view does not name, stays out
		default:
			return null
	}
}

// the manual scan route and one scan's recap
export const scansRoute = new Hono<AppEnv>()
	.get("/scans/:id", async (context) => {
		// the scan with its topic, so the topic's own visibility decides who may read the recap
		const [scanRow] = await db
			.select({ scanSummary: scans.scanSummary, sourceResults: scans.sourceResults, topic: topics })
			.from(scans)
			.innerJoin(topics, eq(topics.id, scans.topicId))
			.where(eq(scans.id, context.req.param("id")))
		// a scan on a topic this user may not see returns the same as a missing one
		const userId = currentUser(context)
		if (!(scanRow && (await isAllowed(userId, "topic:view", scanRow.topic)))) {
			return context.json({ error: "not found" }, 404)
		}

		// the recap, and the source results with costs and failure reasons for the owner and admins alone
		const canViewOwnerDetails = await isAllowed(userId, "topic:viewOwnerDetails", scanRow.topic)
		const scanNote: ScanNote = {
			scanSummary: scanRow.scanSummary,
			sourceResults: toSourceResultsView(scanRow.sourceResults, canViewOwnerDetails),
		}
		return context.json(scanNote)
	})
	.post("/topics/:id/scan", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// trigger a manual scan, billed as overage past the daily quota when a card is on file. owner or admin only.
		const scanResult = await runManualScan(userId, context.req.param("id"), toAnalyticsProperties(context))
		if (scanResult.status === "started") {
			return context.json({ remainingScans: scanResult.remainingScans })
		}

		// a scan already running is a conflict, not a quota or authorization failure
		if (scanResult.status === "running") {
			return context.json({ error: "a scan is already running" }, 409)
		}

		// reject the scan with the budget label if the budget is spent, and with the paused label past the cutoff
		if (scanResult.status === "budget" || scanResult.status === "paused") {
			return context.json(
				{ error: scanResult.status === "budget" ? SCAN_SPENT_BUDGET_LABEL : MANUAL_SCAN_PAUSED_LABEL },
				402,
			)
		}

		// a scan that could not start asks the user to try again shortly
		if (scanResult.status === "unavailable") {
			return context.json({ error: SCAN_UNAVAILABLE_ERROR }, 503)
		}

		// an exhausted quota and a non-owner topic scan fail differently
		return scanResult.status === "quota"
			? context.json({ error: "quota exhausted" }, 429)
			: context.json({ error: "forbidden" }, 403)
	})
	.post("/topics/:id/scan/stop", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// stop the Topic's running Scan. a Topic with none running returns the same as one that was stopped
		const stopManualScanResult = await stopManualScan(userId, context.req.param("id"), toAnalyticsProperties(context))
		// map the stop's status to the response
		if (stopManualScanResult.status === "forbidden") {
			return context.json({ error: "forbidden" }, 403)
		}
		if (stopManualScanResult.status === "unavailable") {
			return context.json({ error: SCAN_UNAVAILABLE_ERROR }, 503)
		}
		return context.json({ status: stopManualScanResult.status })
	})
