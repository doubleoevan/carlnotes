// the scheduled Topic builder, the started Scan, and the page start with empty limits that the scheduled topic, scan
// queue, and limit tests share
import type { topics } from "@carlnotes/db/schema/topics"
import type { TopicScanStart } from "@carlnotes/pipeline/scan"
import {
	type StartScheduledTopicPageOptions,
	startScheduledTopicPage,
	type TopicSweepSummary,
} from "./scheduledTopicScans"

// a start of a Scan that always succeeds
export const STARTED_TOPIC_SCAN_START: TopicScanStart = {
	status: "started",
	scan: {} as never,
	whenFinished: async () => {},
}

/**
 * Returns a scheduled weekly Topic with only the fields that startScheduledTopicPage reads.
 * The daily topic limit never skips a weekly Topic.
 */
export function toScheduledTopic(id: string, ownerId = "owner-1"): typeof topics.$inferSelect {
	return { id, ownerId, frequency: "weekly" } as never
}

// a page's Topics, its owners' daily Topics and spent budgets, and any other page option a test sets
type StartScheduledTestPageOptions = Pick<
	StartScheduledTopicPageOptions,
	"scheduledTopics" | "dailyTopicIdsByOwner" | "budgetExhaustedOwnerIds"
> &
	Partial<StartScheduledTopicPageOptions>

/**
 * Starts one page of scheduled Topics with no waiting Scan, no cutoff, no backlog limit, and a lease that holds,
 * unless the test sets them, and returns what the page did.
 */
export async function startScheduledTestPage(
	startScheduledTestPageOptions: StartScheduledTestPageOptions,
): Promise<TopicSweepSummary> {
	const scheduledTopicPageStart = await startScheduledTopicPage({
		dailyTopicOnWeeklyScanIds: new Set(),
		waitingScanTopicIds: new Set(),
		dailySpendCutoffOwnerIds: new Set(),
		dispatchableScanCount: Number.POSITIVE_INFINITY,
		remainingScanCountByOwner: new Map(),
		signal: new AbortController().signal,
		...startScheduledTestPageOptions,
	})
	return scheduledTopicPageStart.topicSweepSummary
}
