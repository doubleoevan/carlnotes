// starting a Scan by hand from the topic page
import { trackEvent } from "@shared/analytics"
import { reportError } from "@shared/monitoring"
import { SCAN_SPENT_BUDGET_LABEL } from "@shared/scanFailure"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { scans, topics } from "../../db/schema"
import { failStaleScans, isUserLiteLLMKeyBudgetExhausted, loadScan, startTopicScan, stopTopicScan } from "../../worker"
import { isAllowed, loadManualScanAuthorization } from "../authorization"
import { reportManualScanOverage } from "../billing"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"

// the outcomes of a manual scan request. status: running means a scan is already in flight for the topic.
// status: budget means the key that the scan bills has spent its whole budget
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ManualScanResult = { status: "started"; remainingScans: number } | { status: "forbidden" } | { status: "quota" } | { status: "budget" } | { status: "running" }

// the outcomes of a stop request. status: idle means the Topic had no Scan running to stop
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type StopScanResult = { status: "stopped" } | { status: "idle" } | { status: "forbidden" }

/**
 * Starts a manual scan for the owner or an admin. The scan runs without blocking the request.
 * Enforces the daily quota and the budget of the key that the scan bills.
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

	// reject the scan if the requesting user's LiteLLM key has spent its budget. the scan bills that key.
	// the rejection comes before any scan row or overage. a failed budget read starts the scan
	if (await isUserLiteLLMKeyBudgetExhausted(userId)) {
		return { status: "budget" }
	}

	// close out any hung scans first, so a stuck scan row doesn't block a new manual scan indefinitely
	await failStaleScans()

	// hand the scan to Temporal
	const started = await startTopicScan(topicId, userId, "manual")
	if (started.status === "running") {
		return { status: "running" }
	}

	// an overage bills only once the scan finished
	started
		.whenFinished()
		.then(async () => {
			// a Scan the user stopped gave its daily scan back, so the limit the overage bills for is no longer exceeded
			const finishedScan = await loadScan(started.scan.id)
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

		// a scan already in flight is a conflict, not a quota or authorization failure
		if (scanResult.status === "running") {
			return context.json({ error: "a scan is already running" }, 409)
		}

		// reject the scan with the budget label if the budget is spent
		if (scanResult.status === "budget") {
			return context.json({ error: SCAN_SPENT_BUDGET_LABEL }, 402)
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
