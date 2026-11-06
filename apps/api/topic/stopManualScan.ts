// stopping a Scan by hand, from the topic page or an MCP client

import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { stopTopicScan } from "@carlnotes/pipeline/scan"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { eq } from "drizzle-orm"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"

// the outcomes of a stop request. status: idle means the Topic had no Scan running to stop, and status: unavailable
// means the cancel call failed
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type StopScanResult = { status: "stopped" } | { status: "idle" } | { status: "forbidden" } | { status: "unavailable" }

/**
 * Stops the Scan a Topic is running. Authority alone decides who may stop it.
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

	// report a cancel call that failed, and return that the stop did not go through
	const stopTopicScanResult = await stopTopicScan(topicId).catch((error: unknown) => {
		reportError(error, "manual-scan", { topicId, userId })
		return null
	})
	if (!stopTopicScanResult) {
		return { status: "unavailable" }
	}

	// a Topic whose Scan already finished has nothing to stop
	if (stopTopicScanResult.status !== "cancelled") {
		return { status: "idle" }
	}
	trackEvent("scan_stopped", userId, { ...analyticsProperties, topicId, isTopicPublic: topic.visibility === "public" })
	return { status: "stopped" }
}
