// how an MCP view watches a Scan: read_scan_status on a poll, until nothing more can change
import type { McpScanStatus } from "@carlnotes/contracts/mcpScanStatus"
import { useCallback, useRef, useState } from "react"
import { usePollWhileScanning } from "@/hooks/useTopicScan"
import { mcpViewHistory, replaceMcpViewToolCall, toMcpViewToolCall } from "./mcpViewHistory"
import { callMcpViewTool, setMcpViewData, toMcpViewData } from "./mcpViewHost"

// how often the MCP view polls, and how long it keeps the faster rate. a poll is a tool call, which counts against the
// caller's rate limit
const FAST_SCAN_POLL_MS = 10_000
const SLOW_SCAN_POLL_MS = 30_000
const FAST_SCAN_POLL_UNTIL_MS = 120_000

// how long the MCP view watches a Podcast Episode record before it stops polling
const PODCAST_EPISODE_WATCH_MS = 30 * 60 * 1000

// what the scan MCP view reads, and how a stop ends the poll
type ScanStatusWatch = {
	mcpScanStatus: McpScanStatus
	isPodcastEpisodeWatchOver: boolean
	stopWatching: () => void
}

/**
 * Returns a Topic's latest Scan status, polled from the first status its tool returned. A rate limited or failed poll
 * keeps the last status and tries again on schedule, and a hidden frame sends no poll.
 */
export function useScanStatus(firstScanStatus: McpScanStatus): ScanStatusWatch {
	const [mcpScanStatus, setMcpScanStatus] = useState(firstScanStatus)
	const [isWatching, setIsWatching] = useState(true)
	const [isPodcastEpisodeWatchOver, setIsPodcastEpisodeWatchOver] = useState(false)

	// the status the next poll compares with, and when the Podcast Episode was first seen recording
	const latestScanStatus = useRef(firstScanStatus)
	const podcastEpisodeRecordingSeenAt = useRef<number | null>(null)

	// one poll, which keeps the status it reads
	const pollScanStatus = useCallback(async (): Promise<void> => {
		const nextScanStatus = await readScanStatus(latestScanStatus.current)
		if (nextScanStatus) {
			latestScanStatus.current = nextScanStatus
			setMcpScanStatus(nextScanStatus)
		}
		// end the watch once the Podcast Episode has recorded past the limit
		if (isPodcastEpisodeRecording(latestScanStatus.current)) {
			podcastEpisodeRecordingSeenAt.current ??= Date.now()
			setIsPodcastEpisodeWatchOver(Date.now() - podcastEpisodeRecordingSeenAt.current >= PODCAST_EPISODE_WATCH_MS)
		}
	}, [])

	// poll while the status can still change and the caller is still watching
	const isPolling = isWatching && !isPodcastEpisodeWatchOver && isScanStatusChanging(mcpScanStatus)
	usePollWhileScanning(isPolling, pollScanStatus, toScanStatusPollMs)
	return { mcpScanStatus, isPodcastEpisodeWatchOver, stopWatching: () => setIsWatching(false) }
}

// the delay before the next poll, from how long the Scan has been watched
function toScanStatusPollMs(watchedMs: number): number {
	return watchedMs < FAST_SCAN_POLL_UNTIL_MS ? FAST_SCAN_POLL_MS : SLOW_SCAN_POLL_MS
}

// whether a status can still change: a running Scan, or a recap whose Podcast Episode is recording
function isScanStatusChanging(mcpScanStatus: McpScanStatus): boolean {
	return mcpScanStatus.state === "running" || isPodcastEpisodeRecording(mcpScanStatus)
}

// whether a recap's Podcast Episode is recording
function isPodcastEpisodeRecording(mcpScanStatus: McpScanStatus): boolean {
	if (mcpScanStatus.state !== "finished") {
		return false
	}
	const { state } = mcpScanStatus.podcastEpisode
	return state === "recording"
}

// a status's phase, which stays the same across polls of a recording Podcast Episode
function toScanStatusPhase(mcpScanStatus: McpScanStatus): string {
	return mcpScanStatus.state === "finished" ? `finished-${mcpScanStatus.podcastEpisode.state}` : mcpScanStatus.state
}

// the status one poll reads, or null if the poll failed or the route changed during the call. a new phase also goes
// in the route's history entry, so back from the Topic's findings shows that phase
async function readScanStatus(mcpScanStatus: McpScanStatus): Promise<McpScanStatus | null> {
	const scanPathname = mcpViewHistory.location.pathname
	const toolArguments = { topic_id: mcpScanStatus.topicId }
	const toolResult = await callMcpViewTool("read_scan_status", toolArguments).catch(() => null)
	const nextScanStatus = toMcpViewData(toolResult?._meta).scanStatus
	if (!toolResult || !nextScanStatus || toolResult.isError || mcpViewHistory.location.pathname !== scanPathname) {
		return null
	}
	// store the MCP view data and write a new phase to the route's history entry
	setMcpViewData(toolResult._meta)
	if (toScanStatusPhase(nextScanStatus) !== toScanStatusPhase(mcpScanStatus)) {
		const mcpViewToolCall = toMcpViewToolCall(mcpViewHistory.location.state)
		replaceMcpViewToolCall({ toolResult, toolArguments: mcpViewToolCall?.toolArguments ?? toolArguments })
	}
	return nextScanStatus
}
