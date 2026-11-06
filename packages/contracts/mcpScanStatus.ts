// what start_scan and read_scan_status return: a Topic's running Scan, its latest finished Scan, or neither. a stored MCP
// view bundle reads this shape, so it only gains fields
import type { ScanSourceResults, TopicScan } from "./topics"

// where a running Scan is: waiting for a worker, gathering from its Sources, or reviewing what they found
export type McpScanStage = "waiting" | "gathering" | "reviewing"

// a finished Scan's Podcast Episode. recording includes a Scan that just succeeded with no Podcast Episode row yet.
// none means this Scan has no Podcast Episode to wait for
export type McpScanPodcastEpisode =
	| { state: "recording" | "none" }
	| { state: "published"; podcastEpisodeId: string; pagePath: string }

// the Topic the status is about, which every state names
type McpScanTopic = { topicId: string; topicName: string; topicPath: string }

// a running Scan. sourceResults stays null until gathering ends, and canStop says the caller may stop it
export type McpRunningScanStatus = McpScanTopic & {
	state: "running"
	scanId: string
	startedAt: string
	// the Scan's progress, and whether the caller may stop the Scan
	stage: McpScanStage
	sourceResults: ScanSourceResults | null
	keptCount: number
	canStop: boolean
}

// the latest Scan that ran to the end. costDollars, error, and each Source's failure reason need owner details
export type McpFinishedScanStatus = McpScanTopic &
	Pick<
		TopicScan,
		| "status"
		| "startedAt"
		| "finishedAt"
		| "stoppedAt"
		// the Scan's counts, cost, and error
		| "foundCount"
		| "keptCount"
		| "filteredCount"
		| "costDollars"
		| "error"
	> & {
		// the Scan's state, summary, Source results, and Podcast Episode
		state: "finished"
		scanId: string
		scanSummary: string | null
		sourceResults: ScanSourceResults | null
		podcastEpisode: McpScanPodcastEpisode
	}

// a Topic with no Scan that ran to the end and none running
export type McpIdleScanStatus = McpScanTopic & { state: "idle" }

export type McpScanStatus = McpRunningScanStatus | McpFinishedScanStatus | McpIdleScanStatus

// what stop_scan returns beside its text
export type McpScanStop = { status: "stopped" | "idle"; keptCount: number }

// what stop_scan says if its stop fails
export const SCAN_STOP_FAILED_TEXT = "The stop did not go through. Try again in a minute."

/**
 * Returns the line a Topic with no Scan reads as.
 */
export function toIdleScanLine({ topicName }: Pick<McpIdleScanStatus, "topicName">): string {
	return `Nothing has brewed on ${topicName} yet.`
}
