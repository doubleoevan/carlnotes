// the scan history's pages: five scans on screen at a time, sliced from the server's pages of scans

import { fetchTopicScansPage } from "@carlnotes/client/topicClient"
import { TOPIC_SCANS_PAGE_SIZE } from "@carlnotes/contracts/cardPages"
import { TABLE_PAGE_SIZE } from "@carlnotes/contracts/pagination"
import type { TopicResponse, TopicScan } from "@carlnotes/contracts/topics"
import type { ServerCardPages } from "../hooks/useServerPagedCards"
import { toCardsPageRows } from "./cardSections"

// how many scans one page of the scan history shows
export const TOPIC_SCAN_HISTORY_PAGE_SIZE = TABLE_PAGE_SIZE

/**
 * Returns how many scans a topic's history lists, from the count of a page read that holds the newest page alone.
 */
export function toTopicScanCount({ scans, scansPage }: Pick<TopicResponse, "scans" | "scansPage">): number {
	return scansPage?.totalCount ?? scans.length
}

/**
 * Returns the scan history's pages of a topic's scans. A topic page that holds the newest page of scans reads each
 * later page from the server, and one that holds the whole history shows every page from it.
 */
export function toTopicScanPages({
	id: topicId,
	scans,
	scansPage,
}: Pick<TopicResponse, "id" | "scans" | "scansPage">): ServerCardPages<TopicScan> {
	// the server's page of scans, or the whole history as one page that holds every page on screen
	const wholeHistoryPageSize =
		Math.max(1, Math.ceil(scans.length / TOPIC_SCAN_HISTORY_PAGE_SIZE)) * TOPIC_SCAN_HISTORY_PAGE_SIZE
	return {
		queryKey: ["topic-scans", topicId],
		loadedPage: { rows: scans, page: scansPage?.page ?? 0, totalCount: toTopicScanCount({ scans, scansPage }) },
		fetchPage: (page) => fetchTopicScansPage(topicId, page).then(toCardsPageRows("scans")),
		pageSize: TOPIC_SCAN_HISTORY_PAGE_SIZE,
		fetchedPageSize: scansPage ? TOPIC_SCANS_PAGE_SIZE : wholeHistoryPageSize,
	}
}
