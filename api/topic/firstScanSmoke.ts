// the smoke helper that stops a created topic's first scan once its workflow has started
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { scans } from "../../db/schema/scans"
import { stopTopicScan } from "../../worker"

// how long the wait for the first scan's dispatch lasts, and how often it reads the row
const DISPATCH_WAIT_MS = 30 * 1000
const DISPATCH_POLL_MS = 250

/**
 * Stops a created topic's first scan once its workflow has started, and waits for the workflow to end.
 * A first scan that failed before its start, or one still undispatched after the wait, is left as it is.
 */
export async function stopFirstScan(topicId: string): Promise<void> {
	// wait for the first scan row to be dispatched or to fail. the creation starts it after the source screens, outside
	// the request that created the topic
	const deadline = Date.now() + DISPATCH_WAIT_MS
	while (Date.now() < deadline) {
		// read the first scan row's status and dispatch time
		const [firstScan] = await db
			.select({ dispatchedAt: scans.dispatchedAt, status: scans.status })
			.from(scans)
			.where(eq(scans.topicId, topicId))
			.limit(1)

		// stop waiting once the row is dispatched, failed, or gone
		if (firstScan?.status !== "running" || firstScan.dispatchedAt) {
			break
		}
		await Bun.sleep(DISPATCH_POLL_MS)
	}

	// stop the running workflow and wait for it to end
	const stopTopicScanResult = await stopTopicScan(topicId)
	if (stopTopicScanResult.status === "cancelled") {
		await stopTopicScanResult.whenStopped()
	}
}
