// a topic's scan rows: the read of its scans newest first, every scan or one page of the history, and the page's scan
// fields that the newest scan's row holds

import { TOPIC_SCANS_PAGE_SIZE } from "@carlnotes/contracts/cardPages"
import type { TopicResponse, TopicScan } from "@carlnotes/contracts/topics"
import { db, isFindingShown } from "@carlnotes/db"
import { findings, scans } from "@carlnotes/db/schema/scans"
import type { topics } from "@carlnotes/db/schema/topics"
import {
	toTopicMemoryGroupCount,
	toVisibleTopicMemoryGroups,
	type VisibleTopicMemoryGroups,
} from "@carlnotes/db/topicMemories"
import { and, desc, eq, gt, gte, isNull, type SQL, sql } from "drizzle-orm"
import { toLastTopicScanFields } from "./helpers"
import { startOfUtcMonth } from "./quotas"

// the scan rows, the scan history built from them, whether the read holds the newest page of scans alone, and whether
// the user sees what the scans cost
type ToTopicScanFieldsOptions = {
	scanRows: TopicScanRowWithGroups[]
	scanHistory: TopicScan[]
	isNewestScans: boolean
	canViewOwnerDetails: boolean
}

/**
 * Returns the latest succeeded scan, its recap and duration, the month's cost for a user who sees it, the page of scans
 * for a read that holds one, and the reader's Journal count. The newest scan's row holds the recap, the month's cost,
 * the scan count, and the Journal groups.
 */
export function toTopicScanFields({
	scanRows,
	scanHistory,
	isNewestScans,
	canViewOwnerDetails,
}: ToTopicScanFieldsOptions): ReturnType<typeof toLastTopicScanFields> &
	Pick<TopicResponse, "monthCostDollars" | "scansPage" | "topicMemoryCount"> {
	const [newestScanRow] = scanRows
	return {
		...toLastTopicScanFields(scanHistory, newestScanRow?.lastScanSummary ?? null),
		monthCostDollars: canViewOwnerDetails ? (newestScanRow?.monthCost ?? 0) : null,
		scansPage: isNewestScans ? { page: 0, totalCount: newestScanRow?.scanCount ?? 0 } : undefined,
		topicMemoryCount: toTopicMemoryGroupCount(newestScanRow?.topicMemoryGroups),
	}
}

// the topic, the user, whether the read builds the head, and whether it holds the newest page of scans alone
type StartTopicScanRowsReadOptions = Pick<TopicScanRowsQueryOptions, "topic" | "userId" | "isHeadRead"> & {
	isNewestScans: boolean
}

// the started read of a topic's scans, and the ids of the scans that a page of the scan history lists if the read holds
// one page
type TopicScanRowsReads = {
	scanRowsRead: Promise<TopicScanRowWithGroups[]>
	pageScanIds: Promise<ReadonlySet<string>> | undefined
}

/**
 * Starts the read of a topic's scans, the whole history or its newest page, with the page's scan ids for its podcast
 * episodes. A failed scan read fails the page through its own read, and the page's scan ids catch that same
 * failure so it is never left unhandled.
 */
export function startTopicScanRowsRead({
	topic,
	userId,
	isHeadRead,
	isNewestScans,
}: StartTopicScanRowsReadOptions): TopicScanRowsReads {
	// the whole history needs no page's ids
	if (!isNewestScans) {
		return {
			scanRowsRead: Promise.resolve(toTopicScanRowsQuery({ topic, userId, isHeadRead })),
			pageScanIds: undefined,
		}
	}

	// the newest page of scans, and its ids once the page is read. a topic whose every scan was stopped has an empty
	// history, so its stopped scans are read instead, whose newest row holds the month's cost and the Journal groups
	const scanRowsRead = toTopicScanRowsQuery({ topic, userId, isHeadRead, scansPage: 0 }).then((scanRows) =>
		scanRows.length > 0 ? scanRows : toTopicScanRowsQuery({ topic, userId, isHeadRead }),
	)
	const pageScanIds = scanRowsRead.then((scanRows) => new Set(scanRows.map((scanRow) => scanRow.id)))
	pageScanIds.catch(() => undefined)
	return { scanRowsRead, pageScanIds }
}

// the scan columns that a topic page shows
type TopicScanRow = Pick<
	typeof scans.$inferSelect,
	// when the scan ran and how it ended
	| "id"
	| "status"
	| "startedAt"
	| "finishedAt"
	| "stoppedAt"
	| "error"
	// what it found and kept, and what it cost
	| "foundCount"
	| "keptCount"
	| "filteredCount"
	| "cost"
>

// a scan row with what the newest scan's row also holds: the reader's Journal groups, for a head read the topic's
// shown finding count and when its newest shown finding was created, the newest recap, for a head read the newest recap
// of a scan that kept findings, and the month's cost. a page's rows also hold how many scans the history lists
export type TopicScanRowWithGroups = TopicScanRow & {
	topicMemoryGroups: VisibleTopicMemoryGroups | null
	shownFindingCount: number | null
	newestShownFindingAt: Date | null
	// the recaps, the month's cost, and the scan count
	lastScanSummary: string | null
	headScanSummary: string | null
	monthCost: number | null
	scanCount: number | null
}

// the topic whose scans to read, the reader, whether the page's head reads the topic's shown findings too, and the
// zero-based page of the history's scans to read, which leaves out a stopped scan, or every scan if it names none
type TopicScanRowsQueryOptions = {
	topic: Pick<typeof topics.$inferSelect, "id" | "visibility">
	userId: string | null
	isHeadRead: boolean
	scansPage?: number
}

/**
 * Returns the read of a topic's scan history in display order, without the scans' recaps. The newest scan's row reads
 * one recap, and two for a head read.
 */
export function toTopicScanRowsQuery({
	topic: { id: topicId, visibility },
	userId,
	isHeadRead,
	scansPage,
}: TopicScanRowsQueryOptions) {
	// read the visible group inputs once with the newest scan
	const isNewestScan = sql`row_number() over (order by ${scans.startedAt} desc, ${scans.id}) = 1`
	const topicMemoryGroups = sql<VisibleTopicMemoryGroups | null>`case when ${isNewestScan}
		then ${toVisibleTopicMemoryGroups({ topicId, userId, visibility })} end`

	// a head read's shown finding count and newest shown finding time, once with the newest scan, and null otherwise
	const shownTopicFindings = and(eq(findings.topicId, topicId), isFindingShown)
	const shownFindingCount = isHeadRead
		? sql<number | null>`case when ${isNewestScan}
			then (select count(*) from ${findings} where ${shownTopicFindings}) end`.mapWith(Number)
		: sql<null>`null`
	const newestShownFindingAt = isHeadRead
		? sql<Date | null>`case when ${isNewestScan}
			then (select max(${findings.createdAt}) from ${findings} where ${shownTopicFindings}) end`.mapWith(
				findings.createdAt,
			)
		: sql<null>`null`

	// the recap of the newest succeeded scan that was not stopped, and for a head read the recap of the newest succeeded
	// scan that kept findings, stopped or not, each once with the newest scan
	const succeededTopicScanWithRecap = and(
		eq(scans.topicId, topicId),
		eq(scans.status, "succeeded"),
		sql`${scans.scanSummary} <> ''`,
	)
	const lastScanSummary = sql<string | null>`case when ${isNewestScan}
		then (${toNewestScanSummary(and(succeededTopicScanWithRecap, isNull(scans.stoppedAt)))}) end`
	const headScanSummary = isHeadRead
		? sql<string | null>`case when ${isNewestScan}
			then (${toNewestScanSummary(and(succeededTopicScanWithRecap, gt(scans.keptCount, 0)))}) end`
		: sql<null>`null`

	// the month's cost, stopped scans included, summed once with the newest scan. a page's rows count the history's scans
	const monthCost = sql<number | null>`case when ${isNewestScan}
		then (select coalesce(sum(${scans.cost}), 0) from ${scans}
			where ${and(eq(scans.topicId, topicId), gte(scans.startedAt, startOfUtcMonth(new Date())))}) end`.mapWith(Number)
	const scanCount = scansPage === undefined ? sql<null>`null` : sql<number>`count(*) over ()`.mapWith(Number)
	const scanRowsQuery = db
		.select({
			id: scans.id,
			status: scans.status,
			startedAt: scans.startedAt,
			finishedAt: scans.finishedAt,
			stoppedAt: scans.stoppedAt,
			foundCount: scans.foundCount,
			keptCount: scans.keptCount,
			filteredCount: scans.filteredCount,
			cost: scans.cost,
			error: scans.error,
			topicMemoryGroups,
			shownFindingCount,
			newestShownFindingAt,
			lastScanSummary,
			headScanSummary,
			monthCost,
			scanCount,
		})
		.from(scans)
		.where(scansPage === undefined ? eq(scans.topicId, topicId) : toHistoryScansFilter(topicId))
		.orderBy(desc(scans.startedAt), scans.id)

	// every scan, or one page of the history, whose pages hold the same scans the history lists
	return scansPage === undefined
		? scanRowsQuery.$dynamic()
		: scanRowsQuery
				.$dynamic()
				.limit(TOPIC_SCANS_PAGE_SIZE)
				.offset(scansPage * TOPIC_SCANS_PAGE_SIZE)
}

/**
 * Returns the filter of the scans a topic's history lists: every scan of the topic but a stopped one.
 */
export function toHistoryScansFilter(topicId: string): SQL | undefined {
	return and(eq(scans.topicId, topicId), isNull(scans.stoppedAt))
}

// the recap of a topic's newest scan that matches the condition, as a subquery that reads one row
function toNewestScanSummary(scanCondition: SQL | undefined): SQL {
	return sql`select ${scans.scanSummary} from ${scans} where ${scanCondition}
		order by ${scans.startedAt} desc, ${scans.id} limit 1`
}
