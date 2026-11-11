// the updates list: a user's unread Findings ranked, trimmed to a reading budget, and marked read

import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { FindingSearchTopic } from "@carlnotes/contracts/search"
import { toTopicPath } from "@carlnotes/contracts/seo"
import {
	DEFAULT_UPDATES_MINUTES,
	type Updates,
	type UpdatesFinding,
	type UpdatesMinutes,
} from "@carlnotes/contracts/updates"
import { db, isFindingShown } from "@carlnotes/db"
import { toActivatedScanFilter, toTopicRoleFilter } from "@carlnotes/db/contentFilters"
import { toConvertedPersonalSourcesFilter } from "@carlnotes/db/personalSourcesAuthority"
import { bookmarks, consumptions, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, desc, eq, inArray, isNull, max, ne, or, sql } from "drizzle-orm"
import type { AnalyticsProperties } from "../currentUser"
import { attachTopicFindingFaviconPaths } from "../favicons"
import { MCP_PAGE_MAX_CHARS, packPage } from "../mcp/results"
import { loadLatestPodcastEpisodes } from "../podcast/podcastEpisodeShapes"
import { toFindingSearchTopic } from "../search/findingSearch"
import { loadViewableTopic } from "./accessibleFindings"
import { activeSubscriptionTopicIdQuery } from "./feeds"
import { setFindingsConsumed } from "./findingFeedback"
import { loadTopicFindingPermissions } from "./findingPermissions"
import {
	TOPIC_FINDING_COLUMNS,
	type TopicFindingRow,
	toBookmarkJoinCondition,
	toConsumptionJoinCondition,
	toTopicFinding,
	USER_FINDING_COLUMNS,
} from "./findings"
import { toReadingMinutes } from "./readingMinutes"
import { loadUpdatesOpener } from "./updatesOpener"

// the most unread Findings that one list ranks
const MAX_RANKED_FINDINGS = 500

// how far up the score scale a Finding moves if it arrived after the user's last read time. scores bunch near the
// top of the scale, so this passes most older Findings
const RECENCY_BOOST = 0.1

// the characters that a list's Findings may fill, leaving room in the page for the opener and the more link
const UPDATES_FINDINGS_MAX_CHARS = MCP_PAGE_MAX_CHARS - 1024

// what the model's copy adds to a row: a fence of about 110 characters around each of its five untrusted texts
const UPDATES_FINDING_FENCE_CHARS = 600

// a built list, with each Finding's Topic once and each Topic's latest podcast episode the user may listen to
export type BuiltUpdates = Updates & { topics: FindingSearchTopic[]; podcastEpisodes: PodcastEpisode[] }

// the user asking, the reading budget, the one Topic of a scoped list, and the request's analytics properties
type BuildUpdatesOptions = {
	userId: string
	minutes: UpdatesMinutes
	topicId: string | null
	analyticsProperties: AnalyticsProperties
}

// an unread Finding as the list reads it, with what the ranking and the reading budget need
type UnreadFindingRow = TopicFindingRow & {
	topicId: string
	topicName: string
	findingCreatedAt: Date
	contentBytes: number | null
	durationSeconds: number | null
	// every unread Finding the read matched, past its limit
	unreadCount: number
}

/**
 * Builds a user's list and marks its Findings read, or returns null if the user may not read the Topic it names. The
 * Findings that did not fit stay unread and collapse into the more count. Each Finding returns as unread, though it now
 * counts as read.
 */
export async function buildUpdates({
	userId,
	minutes,
	topicId,
	analyticsProperties,
}: BuildUpdatesOptions): Promise<BuiltUpdates | null> {
	// a scoped list needs read access to its Topic
	const topic = topicId ? await loadViewableTopic(userId, topicId) : null
	if (topicId && !topic) {
		return null
	}

	// rank the unread Findings around the user's last read time, then keep what fits the reading budget and the page
	const [unreadRows, lastConsumedAt] = await Promise.all([
		loadUnreadFindingRows(userId, topicId),
		loadLastConsumedAt(userId, topicId),
	])
	const budgetRows = trimToReadingBudget(rankFindingRows(unreadRows, lastConsumedAt), minutes)
	const budgetFindings = budgetRows.map(toUpdatesFinding)
	await attachTopicFindingFaviconPaths(budgetFindings)
	const updatesFindings = packPage(
		budgetFindings,
		0,
		UPDATES_FINDINGS_MAX_CHARS,
		budgetRows.length,
		UPDATES_FINDING_FENCE_CHARS,
	).items

	// the rows' Topics load before the consumptions, so a failed read can never lose a list
	const updatesTopics = await loadUpdatesTopics(userId, updatesFindings)

	// the consumptions go first, so a failed opener can never repeat a Finding in the next list
	await setFindingsConsumed(
		userId,
		updatesFindings.map((finding) => finding.findingId),
		analyticsProperties,
	)
	const opener =
		updatesFindings.length > 0
			? await loadUpdatesOpener({ userId, topicId, loadUpdatesFindings: async () => updatesFindings })
			: null
	const moreCount = (unreadRows[0]?.unreadCount ?? 0) - updatesFindings.length

	// report every list, an empty one included, by its counts
	trackEvent("updates_requested", userId, {
		...analyticsProperties,
		...(topicId ? { topicId } : {}),
		minutes,
		findingCount: updatesFindings.length,
		moreCount,
		hasOpener: opener !== null,
	})
	return {
		opener,
		findings: updatesFindings,
		moreCount,
		morePath: topic ? toTopicPath(topic) : "/topics",
		...updatesTopics,
	}
}

/**
 * Reads the day's opener across the user's Topics and marks no Finding read. The opener is the one a list across
 * Topics shows, written from the unread Findings the default list would hold. A stored opener returns with no Findings
 * read. A user with no unread Finding keeps the opener the day already stored, and no model call runs for them.
 */
export function readUpdatesOpener(userId: string): Promise<string | null> {
	return loadUpdatesOpener({ userId, topicId: null, loadUpdatesFindings: () => loadDefaultUpdatesFindings(userId) })
}

// the unread Findings that the default list across the user's Topics would hold, ranked and inside its reading budget
async function loadDefaultUpdatesFindings(userId: string): Promise<UpdatesFinding[]> {
	const [unreadRows, lastConsumedAt] = await Promise.all([
		loadUnreadFindingRows(userId, null),
		loadLastConsumedAt(userId, null),
	])
	const budgetRows = trimToReadingBudget(rankFindingRows(unreadRows, lastConsumedAt), DEFAULT_UPDATES_MINUTES)
	return budgetRows.map(toUpdatesFinding)
}

// each Finding's Topic once, with whether the user may rate and bookmark its Findings, and each Topic's latest podcast
// episode that the user may listen to
async function loadUpdatesTopics(
	userId: string,
	updatesFindings: UpdatesFinding[],
): Promise<Pick<BuiltUpdates, "topics" | "podcastEpisodes">> {
	const topicIds = [...new Set(updatesFindings.map((finding) => finding.topicId))]
	if (topicIds.length === 0) {
		return { topics: [], podcastEpisodes: [] }
	}

	// the Topics, then what the user may do with each one
	const topicRows = await db
		.select({
			id: topics.id,
			name: topics.name,
			prompt: topics.prompt,
			visibility: topics.visibility,
			imageHash: topics.imageHash,
			ownerId: topics.ownerId,
			teamId: topics.teamId,
		})
		.from(topics)
		.where(inArray(topics.id, topicIds))
	const [findingPermissionsByTopicId, latestPodcastEpisodes] = await Promise.all([
		loadTopicFindingPermissions(userId, topicRows),
		loadLatestPodcastEpisodes(topicRows, userId),
	])
	return {
		topics: topicRows.map((topicRow) => toFindingSearchTopic(topicRow, findingPermissionsByTopicId)),
		podcastEpisodes: [...latestPodcastEpisodes.values()],
	}
}

// the user's unread Findings by score, on one Topic or across the Topics they subscribe to, under the Feed's visibility
// rules
async function loadUnreadFindingRows(userId: string, topicId: string | null): Promise<UnreadFindingRow[]> {
	// a scoped read already passed the Topic's read check. a subscribed Topic can turn private on its subscribers, and a
	// private Topic another user owns stays out until its generated text is converted
	const topicFilter = topicId
		? eq(findings.topicId, topicId)
		: and(
				inArray(findings.topicId, activeSubscriptionTopicIdQuery(userId)),
				or(
					ne(topics.visibility, "private"),
					and(toTopicRoleFilter(userId), or(eq(topics.ownerId, userId), toConvertedPersonalSourcesFilter())),
				),
			)

	// join each unread Finding with its resource, scan, and Topic. a left join finds the consumptions to leave out
	return (
		db
			.select({
				// the topic finding, its Topic, its resource's length, when it arrived, and the user's own columns
				...TOPIC_FINDING_COLUMNS,
				topicId: findings.topicId,
				topicName: topics.name,
				contentBytes: resources.contentBytes,
				durationSeconds: resources.durationSeconds,
				findingCreatedAt: findings.createdAt,
				...USER_FINDING_COLUMNS,
				unreadCount: sql<number>`count(*) over ()`.mapWith(Number),
			})
			.from(findings)
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.innerJoin(scans, eq(findings.scanId, scans.id))
			.innerJoin(topics, eq(findings.topicId, topics.id))
			.leftJoin(consumptions, toConsumptionJoinCondition(userId))
			.leftJoin(bookmarks, toBookmarkJoinCondition(userId))
			// keep the unread shown Findings that the user may read, highest relevance first
			.where(and(isNull(consumptions.id), isFindingShown, toActivatedScanFilter(userId), topicFilter))
			.orderBy(desc(findings.relevanceScore), desc(findings.createdAt), findings.id)
			.limit(MAX_RANKED_FINDINGS)
	)
}

// the newest time the user marked a Finding read, on any Topic or on the one Topic of a scoped list
async function loadLastConsumedAt(userId: string, topicId: string | null): Promise<Date | null> {
	const [lastConsumedRow] = await db
		.select({ lastConsumedAt: max(consumptions.consumedAt) })
		.from(consumptions)
		.innerJoin(findings, eq(consumptions.findingId, findings.id))
		.where(and(eq(consumptions.userId, userId), topicId ? eq(findings.topicId, topicId) : undefined))
	return lastConsumedRow?.lastConsumedAt ?? null
}

/**
 * Ranks rows by score with the recency boost for those that arrived after the last read time, then newest first, then
 * by Finding id. With no last read time, no row gets the boost.
 */
export function rankFindingRows<Row extends RankedFindingRow>(findingRows: Row[], lastConsumedAt: Date | null): Row[] {
	// the boost sets only the order, so a row from before the last read time stays ranked
	const toBoostedScore = (findingRow: Row): number =>
		lastConsumedAt && findingRow.findingCreatedAt > lastConsumedAt
			? findingRow.relevanceScore + RECENCY_BOOST
			: findingRow.relevanceScore
	return findingRows.toSorted(
		(rowA, rowB) =>
			toBoostedScore(rowB) - toBoostedScore(rowA) ||
			rowB.findingCreatedAt.getTime() - rowA.findingCreatedAt.getTime() ||
			rowA.findingId.localeCompare(rowB.findingId),
	)
}

// what the ranking reads from a row
type RankedFindingRow = { findingId: string; relevanceScore: number; findingCreatedAt: Date }

/**
 * Walks the ranked rows and keeps each that fits what remains of the budget, so a long Finding never ends the list.
 * The top row always stays, whatever its length.
 */
export function trimToReadingBudget<Row extends Parameters<typeof toReadingMinutes>[0]>(
	rankedRows: Row[],
	minutes: number,
): Row[] {
	const budgetRows: Row[] = []
	let usedMinutes = 0

	// add each row that fits, skipping one that does not
	for (const rankedRow of rankedRows) {
		const rowMinutes = toReadingMinutes(rankedRow)
		// keep the first row at any length. a later row must fit the minutes left
		if (budgetRows.length === 0 || usedMinutes + rowMinutes <= minutes) {
			budgetRows.push(rankedRow)
			usedMinutes += rowMinutes
		}
	}
	return budgetRows
}

// a row as the list returns it, with its Topic and the minutes it takes
function toUpdatesFinding(unreadRow: UnreadFindingRow): UpdatesFinding {
	return {
		...toTopicFinding(unreadRow),
		topicId: unreadRow.topicId,
		topicName: unreadRow.topicName,
		topicPath: toTopicPath({ id: unreadRow.topicId, name: unreadRow.topicName }),
		readingMinutes: toReadingMinutes(unreadRow),
	}
}
