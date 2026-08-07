// starting a Scan by hand from the topic page. the scan itself runs in the worker, so this only authorizes it,
// rejects a duplicate, and hands it off without blocking the request
import { trackEvent } from "@shared/analytics"
import { reportError } from "@shared/monitoring"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { topics } from "../../db/schema"
import { failStaleScans, startTopicScan } from "../../worker"
import { loadManualScanAuthorization } from "../authorization"
import { reportManualScanOverage } from "../billing"
import type { AnalyticsProperties } from "../currentUser"

// the outcomes of a manual scan request. status: running means a scan is already in flight for the topic
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ManualScanResult = { status: "started"; remainingScans: number } | { status: "forbidden" } | { status: "quota" } | { status: "running" }

/**
 * Start a manual scan for the owner or an admin, enforcing the daily quota. The scan runs without blocking the request.
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

	// close out any hung scans first, so a stuck scan row doesn't block a new manual scan indefinitely
	await failStaleScans()

	// hand the scan to Temporal. a topic already scanning is rejected by the workflow id,
	// a scan is charged to whoever fired it, so an admin's scan never draws down the owner's quota or budget
	const started = await startTopicScan(topicId, userId, "manual")
	if (started.status === "running") {
		return { status: "running" }
	}

	// an overage bills only once the scan finished, so it waits on the workflow with a promise instead of on this request with an await.
	// the email is sent by the workflow itself, which means a scan that resumed after a crash still sends one
	started.whenFinished
		.then(async () => {
			if (authorization.isOverage) {
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
