// one later page of a topic's scan history after a topic page read's newest page, or the whole history

import type { TopicScansPage } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import type { topics } from "@carlnotes/db/schema/topics"
import { count } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { loadScanPodcastEpisodes } from "../podcast/helpers"
import { toScanHistory } from "./helpers"
import { toHistoryScansFilter, toTopicScanRowsQuery } from "./topicScanRows"

// the user, null for a visitor, the topic they may open, and the zero-based page of scans, or every scan if it names
// none
type LoadTopicScansPageOptions = { userId: string | null; topic: typeof topics.$inferSelect; page?: number }

/**
 * Loads one zero-based page of a topic's scans, or every scan, newest first with a stopped scan left out, each with its
 * published podcast episode, and how many scans the history lists.
 */
export async function loadTopicScansPage({ userId, topic, page }: LoadTopicScansPageOptions): Promise<TopicScansPage> {
	// the page's scan rows, and whether the user sees what each scan cost
	const [scanRows, canViewOwnerDetails] = await Promise.all([
		toTopicScanRowsQuery({ topic, userId, isHeadRead: false, scansPage: page }),
		isAllowed(userId, "topic:viewOwnerDetails", topic),
	])

	// the page's scans with their podcast episodes, and the history's count: every scan's own count, or the page's from
	// its rows, or from a count of its own for a page past the last scan
	const scanHistory = toScanHistory(scanRows, canViewOwnerDetails)
	const [podcastEpisodeByScanId, totalCount] = await Promise.all([
		loadScanPodcastEpisodes({ topic, userId, scanIds: new Set(scanHistory.map((topicScan) => topicScan.id)) }),
		page === undefined ? scanHistory.length : (scanRows[0]?.scanCount ?? loadTopicScanCount(topic.id)),
	])
	return {
		scans: scanHistory.map((topicScan) => ({
			...topicScan,
			podcastEpisode: podcastEpisodeByScanId.get(topicScan.id) ?? null,
		})),
		totalCount,
	}
}

// how many scans a topic's history lists
async function loadTopicScanCount(topicId: string): Promise<number> {
	const [scanCountRow] = await db.select({ scanCount: count() }).from(scans).where(toHistoryScansFilter(topicId))
	return scanCountRow?.scanCount ?? 0
}
