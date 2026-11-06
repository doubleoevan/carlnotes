// the Scan statuses the scan tools' tests read and the scan MCP view's stories and tests render, typed from the
// contract, so a renamed field fails the type check
import type { McpFinishedScanStatus, McpRunningScanStatus, McpScanPodcastEpisode, McpScanStatus } from "./mcpScanStatus"
import type { ScanSourceResults } from "./topics"

// what a Topic's Sources found once gathering ended
const SCAN_SOURCE_RESULTS: ScanSourceResults = {
	sources: [
		{
			sourceId: "source-1",
			sourceKind: "rss",
			label: "Hacker News front page",
			foundCount: 64,
			keptCount: 3,
			costDollars: null,
			durationMs: 1800,
			status: "ok",
		},
	],
	earlierKeptCount: 0,
	earlierFoundCount: 0,
}

// the Topic every Scan status below is about
const SCAN_TOPIC = {
	topicId: "topic-llm-tooling",
	topicName: "LLM tooling",
	topicPath: "/topics/topic-llm-tooling/llm-tooling",
}

// a Topic with no Scan
export const IDLE_SCAN_STATUS: McpScanStatus = { ...SCAN_TOPIC, state: "idle" }

// a Scan waiting for a worker, which its owner may stop
export const RUNNING_SCAN_STATUS: McpRunningScanStatus = {
	...SCAN_TOPIC,
	state: "running",
	scanId: "scan-1",
	startedAt: "2026-11-01T09:00:00.000Z",
	stage: "waiting",
	sourceResults: null,
	keptCount: 0,
	canStop: true,
}

// a Scan reviewing what its Sources found
export const REVIEWING_SCAN_STATUS: McpRunningScanStatus = {
	...RUNNING_SCAN_STATUS,
	stage: "reviewing",
	sourceResults: SCAN_SOURCE_RESULTS,
	keptCount: 3,
}

// a recap with no Podcast Episode to wait for
export const FINISHED_SCAN_STATUS: McpFinishedScanStatus = {
	...SCAN_TOPIC,
	state: "finished",
	scanId: "scan-1",
	status: "succeeded",
	startedAt: "2026-11-01T09:00:00.000Z",
	finishedAt: "2026-11-01T09:04:00.000Z",
	stoppedAt: null,
	foundCount: 64,
	keptCount: 3,
	filteredCount: 61,
	costDollars: null,
	error: null,
	scanSummary: "Three releases are worth reading today.",
	sourceResults: SCAN_SOURCE_RESULTS,
	podcastEpisode: { state: "none" },
}

/**
 * Returns a recap with its Podcast Episode in a state.
 */
export function toRecapWithPodcastEpisode(podcastEpisode: McpScanPodcastEpisode): McpFinishedScanStatus {
	return { ...FINISHED_SCAN_STATUS, podcastEpisode }
}
