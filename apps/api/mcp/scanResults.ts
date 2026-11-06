// what the mcp scan tools read: a Topic's running Scan or its latest finished one, and the text a client without an MCP
// view reads

import {
	type McpScanPodcastEpisode,
	type McpScanStage,
	type McpScanStatus,
	toIdleScanLine,
} from "@carlnotes/contracts/mcpScanStatus"
import { toPodcastEpisodePath, toTopicPath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, scans } from "@carlnotes/db/schema/scans"
import type { topics } from "@carlnotes/db/schema/topics"
import { toUntrustedFence } from "@carlnotes/models/prompts/write"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { loadAccessiblePodcastEpisode } from "../podcast/podcastEpisodeRows"
import { toTopicScan } from "../topic/helpers"
import { toSourceResultsView } from "../topic/scans"
import { type ToolCaller, toToolCallerUserId } from "./toolCaller"

// the words each stage of a running Scan reads as
const SCAN_STAGE_LABELS: Record<McpScanStage, string> = {
	waiting: "waiting for its turn",
	gathering: "gathering from its sources",
	reviewing: "reviewing what it found",
}

// how long a succeeded Scan waits for its Podcast Episode workflow to create a row
const PODCAST_EPISODE_START_MS = 2 * 60 * 1000

// a Topic row
type TopicRow = typeof topics.$inferSelect

/**
 * Returns a readable Topic's running Scan, or its latest Scan that a stop did not end, or idle with neither.
 */
export async function loadMcpScanStatus(toolCaller: ToolCaller, topic: TopicRow): Promise<McpScanStatus> {
	// the newest Scan that a stop did not end, and what this caller may do and see
	const userId = toToolCallerUserId(toolCaller)
	const [[scanRow], canViewOwnerDetails, canStop] = await Promise.all([
		db
			.select()
			.from(scans)
			.where(and(eq(scans.topicId, topic.id), isNull(scans.stoppedAt)))
			.orderBy(desc(scans.startedAt))
			.limit(1),
		isAllowed(userId, "topic:viewOwnerDetails", topic),
		isAllowed(userId, "scan:request", topic),
	])
	const scanTopic = { topicId: topic.id, topicName: topic.name, topicPath: toTopicPath(topic) }
	if (!scanRow) {
		return { ...scanTopic, state: "idle" }
	}

	// a running Scan reads its progress
	if (scanRow.status === "running") {
		const [keptCountRow] = await db.select({ keptCount: count() }).from(findings).where(eq(findings.scanId, scanRow.id))
		return {
			...scanTopic,
			state: "running",
			scanId: scanRow.id,
			startedAt: scanRow.startedAt.toISOString(),
			stage: toScanStage(scanRow),
			sourceResults: toSourceResultsView(scanRow.ingestSourceResults, canViewOwnerDetails),
			keptCount: keptCountRow?.keptCount ?? 0,
			canStop,
		}
	}

	// a finished Scan reads its recap, shaped the way the topic page shapes it, and its Podcast Episode
	const { id: scanId, error, podcastEpisode: _podcastEpisode, ...topicScan } = toTopicScan(scanRow, canViewOwnerDetails)
	return {
		...scanTopic,
		...topicScan,
		state: "finished",
		scanId,
		error: canViewOwnerDetails ? error : null,
		scanSummary: scanRow.scanSummary,
		sourceResults: toSourceResultsView(scanRow.sourceResults, canViewOwnerDetails),
		podcastEpisode: await loadScanPodcastEpisode(userId, topic, scanRow),
	}
}

/**
 * Returns the status the model reads, with everything a page or a model wrote fenced as data.
 */
export function toFencedScanStatus(mcpScanStatus: McpScanStatus): McpScanStatus {
	const toFencedText = toUntrustedFence()
	const topicName = toFencedText(mcpScanStatus.topicName)
	if (mcpScanStatus.state === "idle") {
		return { ...mcpScanStatus, topicName }
	}

	// a Source's label can be a feed's own name
	const { sourceResults } = mcpScanStatus
	const fencedSourceResults = sourceResults && {
		...sourceResults,
		sources: sourceResults.sources.map((sourceResult) => ({
			...sourceResult,
			label: toFencedText(sourceResult.label),
		})),
	}
	if (mcpScanStatus.state === "running") {
		return { ...mcpScanStatus, topicName, sourceResults: fencedSourceResults }
	}
	const scanSummary = mcpScanStatus.scanSummary && toFencedText(mcpScanStatus.scanSummary)
	return { ...mcpScanStatus, topicName, sourceResults: fencedSourceResults, scanSummary }
}

/**
 * Returns a Scan status as the text a client without an MCP view reads.
 */
export function toScanStatusText(mcpScanStatus: McpScanStatus): string {
	if (mcpScanStatus.state === "idle") {
		return toIdleScanLine(mcpScanStatus)
	}

	// a running Scan's stage, kept count, and what each Source found
	if (mcpScanStatus.state === "running") {
		const sourceLines = (mcpScanStatus.sourceResults?.sources ?? []).map(
			(sourceResult) => `- ${sourceResult.label}: ${sourceResult.foundCount} found`,
		)
		const stageLine = `Carl is brewing ${mcpScanStatus.topicName}, ${SCAN_STAGE_LABELS[mcpScanStatus.stage]}.`
		return [stageLine, `${mcpScanStatus.keptCount} kept so far.`, ...sourceLines].join("\n")
	}

	// a finished Scan's outcome, recap, and Podcast Episode
	const outcomeLine =
		mcpScanStatus.status === "failed"
			? `The latest brew of ${mcpScanStatus.topicName} did not finish.`
			: `The latest brew of ${mcpScanStatus.topicName} found ${mcpScanStatus.foundCount} and kept ${mcpScanStatus.keptCount}.`
	return [outcomeLine, mcpScanStatus.scanSummary, toPodcastEpisodeLine(mcpScanStatus.podcastEpisode)]
		.filter(Boolean)
		.join("\n")
}

// the stage a running Scan is in, from its columns: no worker yet, then no saved progress yet, then review
function toScanStage(scanRow: Pick<typeof scans.$inferSelect, "pickedUpAt" | "ingestSourceResults">): McpScanStage {
	if (!scanRow.pickedUpAt) {
		return "waiting"
	}
	return scanRow.ingestSourceResults ? "reviewing" : "gathering"
}

// a finished Scan's Podcast Episode. the row sets its state, and a Scan that just succeeded with no row yet reads as
// recording
async function loadScanPodcastEpisode(
	userId: string | null,
	topic: TopicRow,
	scanRow: typeof scans.$inferSelect,
): Promise<McpScanPodcastEpisode> {
	const [podcastEpisodeRow] = await db
		.select({ id: podcastEpisodes.id, status: podcastEpisodes.status })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.scanId, scanRow.id))
		.limit(1)
	// a recording or published row sets the state
	if (podcastEpisodeRow?.status === "recording") {
		return { state: "recording" }
	}
	if (podcastEpisodeRow?.status === "published") {
		return loadPublishedScanPodcastEpisode(userId, topic, podcastEpisodeRow.id)
	}

	// no row yet reads as recording only just after a Scan that a podcast follows
	const isPodcastEpisodeExpected = scanRow.status === "succeeded" && topic.isPodcastEnabled
	const finishedAgoMs = scanRow.finishedAt ? Date.now() - scanRow.finishedAt.getTime() : Number.POSITIVE_INFINITY
	const isPodcastEpisodeStarting =
		!podcastEpisodeRow && isPodcastEpisodeExpected && finishedAgoMs < PODCAST_EPISODE_START_MS
	return { state: isPodcastEpisodeStarting ? "recording" : "none" }
}

// a published Podcast Episode, which an inactive invite may not listen to yet
async function loadPublishedScanPodcastEpisode(
	userId: string | null,
	topic: TopicRow,
	podcastEpisodeId: string,
): Promise<McpScanPodcastEpisode> {
	const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId })
	const { season, episodeNumber } = accessiblePodcastEpisode?.podcastEpisodeRow ?? {}
	if (!(season && episodeNumber)) {
		return { state: "none" }
	}
	return { state: "published", podcastEpisodeId, pagePath: toPodcastEpisodePath(topic, { season, episodeNumber }) }
}

// the line that names a Podcast Episode's state
function toPodcastEpisodeLine(podcastEpisode: McpScanPodcastEpisode): string {
	switch (podcastEpisode.state) {
		case "recording":
			return "Its podcast episode is recording."
		// a published Podcast Episode links to its page
		case "published":
			return `Its podcast episode is out: ${SITE_URL}${podcastEpisode.pagePath}`
		default:
			return "It has no podcast episode."
	}
}
