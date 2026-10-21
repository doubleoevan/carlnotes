// starting a Scan by hand from the topic page

import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { isUserLiteLLMKeyBudgetExhausted } from "@carlnotes/models/litellm"
import { loadScan, startTopicScan, stopTopicScan } from "@carlnotes/pipeline/scan"
import { failStaleScans } from "@carlnotes/pipeline/staleScans"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed, loadManualScanAuthorization, loadMonthlyBudgetCutoffStatus } from "../authorization"
import { reportManualScanOverage } from "../billing"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"

// the outcomes of a manual scan request. status: running means a scan is already running for the topic.
// status: budget means the user's monthly budget, or the key that the scan bills, is spent
// status: paused means the user's monthly spend is past the manual scans cutoff and short of the whole budget
// status: unavailable means handing the scan to Temporal threw
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ManualScanResult = { status: "started"; remainingScans: number } | { status: "forbidden" } | { status: "quota" } | { status: "budget" } | { status: "paused" } | { status: "running" } | { status: "unavailable" }

// the outcomes of a stop request. status: idle means the Topic had no Scan running to stop
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type StopScanResult = { status: "stopped" } | { status: "idle" } | { status: "forbidden" }

/**
 * Starts a manual scan for the owner or an admin. The scan runs without blocking the request.
 * Enforces the daily quota, the spent monthly budget, the manual scans cutoff, and the budget of the key that the scan
 * bills.
 */
export async function runManualScan(
	userId: string,
	topicId: string,
	analyticsProperties: AnalyticsProperties,
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

/**
 * Stop the Scan a Topic is running. Authority alone decides who may do this, never the daily quota.
 */
export async function stopManualScan(
	userId: string,
	topicId: string,
	analyticsProperties: AnalyticsProperties,
): Promise<StopScanResult> {
	// only a user who can scan a topic may stop a scan on it
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!(topic && (await isAllowed(userId, "scan:request", topic)))) {
		return { status: "forbidden" }
	}

	// a Topic whose Scan already finished has nothing to stop, which is an answer instead of a failure
	const stopped = await stopTopicScan(topicId)
	if (stopped.status !== "cancelled") {
		return { status: "idle" }
	}
	trackEvent("scan_stopped", userId, { ...analyticsProperties, topicId, isTopicPublic: topic.visibility === "public" })
	return { status: "stopped" }
}

// the manual scan route and one scan's recap
export const scansRoute = new Hono<AppEnv>()
	.get("/scans/:id", async (context) => {
		// the scan with its topic, so the topic's own visibility decides who may read the recap
		const [scanRow] = await db
			.select({ scanSummary: scans.scanSummary, topic: topics })
			.from(scans)
			.innerJoin(topics, eq(topics.id, scans.topicId))
			.where(eq(scans.id, context.req.param("id")))
		// a scan on a topic this user may not see returns the same as a missing one
		if (!(scanRow && (await isAllowed(currentUser(context), "topic:view", scanRow.topic)))) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json({ scanSummary: scanRow.scanSummary })
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
			return context.json({ error: "scanning is temporarily unavailable, try again in a minute" }, 503)
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
		if (stopManualScanResult.status === "forbidden") {
			return context.json({ error: "forbidden" }, 403)
		}
		return context.json({ status: stopManualScanResult.status })
	})
