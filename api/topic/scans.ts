// starting a Scan by hand from the topic page. the scan itself runs in the worker, so this only authorizes it,
// refuses a duplicate, and hands it off without blocking the request
import { trackEvent } from "@shared/analytics"
import { reportError } from "@shared/monitoring"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { scans, topics } from "../../db/schema"
import { failStaleScans, runTopicScan, sendManualScanEmail } from "../../worker"
import { authorizeManualScan } from "../authorization"
import { reportManualScanOverage } from "../billing"
import type { AnalyticsProperties } from "../currentUser"

// the outcomes of a manual scan request. status: running means a scan is already in flight for the topic
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ManualScanResult = { status: "started"; remaining: number } | { status: "forbidden" } | { status: "quota" } | { status: "running" }

/**
 * Start a manual scan for the owner or an admin, enforcing the daily quota through the gate. The scan runs without blocking the request.
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
	const authorization = await authorizeManualScan(userId, topic)
	if (authorization.status !== "allowed") {
		// track the paywall event. the owner triggered another scan without a card on file to bill the overage to
		if (authorization.status === "quota") {
			trackEvent("scan_quota_reached", userId, { ...analyticsProperties, topicId })
		}
		return authorization
	}

	// close out any hung scans first, so a stuck row never blocks a manual fire indefinitely
	await failStaleScans()

	// skip while a scan is already in flight, so a manual fire can't burn a quota slot racing the sweep
	const [runningScan] = await db
		.select({ id: scans.id })
		.from(scans)
		.where(and(eq(scans.topicId, topicId), eq(scans.status, "running")))
	if (runningScan) {
		return { status: "running" }
	}

	// start the scan without awaiting it, since a manual scan runs for minutes.
	// it is charged to whoever fired it, so an admin's scan never draws down the owner's quota or budget
	runTopicScan(topicId, userId, true)
		.then(async (scan) => {
			// a request that never reached the pipeline never charges
			if (!scan) {
				return
			}

			// the overage bills only once the scan really ran, then its outcome goes out by email
			if (authorization.isOverage) {
				await reportManualScanOverage(userId)
			}
			await sendManualScanEmail(userId, topic, scan)
		})
		// report a failed scan and its error
		.catch((error) => {
			console.error(`manual scan failed for topic ${topicId}`, error)
			reportError(error, "manual-scan", { topicId, userId })
		})

	// track the scan request. the scan runs for minutes and nothing should wait for it
	trackEvent("scan_requested", userId, { ...analyticsProperties, topicId })
	return { status: "started", remaining: authorization.remaining }
}
