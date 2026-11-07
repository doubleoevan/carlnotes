// the pages a Scan's score prompt shows as examples: the bookmarked pages, the pages a weighted reaction signal
// places with them, the pages rated thumbs up, and the pages rated thumbs down
import { MINIMUM_REACTION_SIGNAL } from "@carlnotes/contracts/sourceScoring"
import { db } from "@carlnotes/db"
import { bookmarks, findings, resources } from "@carlnotes/db/schema/scans"
import { teamMembers } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topics } from "@carlnotes/db/schema/topics"
import { and, desc, eq, inArray, isNotNull, max, or, sql } from "drizzle-orm"
import { loadFindingReactionSignals } from "./reactionSignals"
import type { ScoreExamplePage, ScoreExamplePages } from "./topicContext"

// the topic fields that decide whose bookmarks count
type BookmarkTopic = { ownerId: string; teamId: string | null }

// one of the topic's findings with its page, as an example list reads it
type FindingPageRow = { findingId: string; title: string | null; url: string }

// a finding with its page and its rating, null for a finding nobody rated
type RatedFindingPageRow = FindingPageRow & { rating: "up" | "down" | null }

// what the example pages are ordered from: the bookmarked pages newest bookmark first, the topic's rated pages and
// its pages with reactions best-scored first, and each finding's reaction signal
type ToScoreExamplePagesOptions = {
	bookmarkedFindingRows: FindingPageRow[]
	ratedOrReactedFindingRows: RatedFindingPageRow[]
	findingReactionSignals: Map<string, number>
}

/**
 * Orders the example pages. The liked ones are the bookmarked pages, then the pages whose reaction signal reaches the
 * minimum, strongest first, then the pages rated thumbs up. A page rated thumbs down is listed with the rated down
 * ones alone, whatever else it has.
 */
export function toScoreExamplePages({
	bookmarkedFindingRows,
	ratedOrReactedFindingRows,
	findingReactionSignals,
}: ToScoreExamplePagesOptions): ScoreExamplePages {
	// a rating of thumbs down outweighs a bookmark and any reaction
	const ratedDownPages = ratedOrReactedFindingRows.filter((findingRow) => findingRow.rating === "down")
	const ratedDownFindingIds = new Set(ratedDownPages.map((ratedDownPage) => ratedDownPage.findingId))

	// the pages whose signal reaches the minimum, strongest first
	const toReactionSignal = (findingId: string): number => findingReactionSignals.get(findingId) ?? 0
	const reactionSignalFindingRows = ratedOrReactedFindingRows
		.filter((findingRow) => toReactionSignal(findingRow.findingId) >= MINIMUM_REACTION_SIGNAL)
		.sort((first, second) => toReactionSignal(second.findingId) - toReactionSignal(first.findingId))

	// each liked page once, in its first group
	const likedFindingIds = new Set<string>()
	const likedOrBookmarkedPages: ScoreExamplePage[] = []
	const likedFindingRows = [
		...bookmarkedFindingRows,
		...reactionSignalFindingRows,
		...ratedOrReactedFindingRows.filter((findingRow) => findingRow.rating === "up"),
	]
	for (const { findingId, title, url } of likedFindingRows) {
		if (ratedDownFindingIds.has(findingId) || likedFindingIds.has(findingId)) {
			continue
		}

		// list the page
		likedFindingIds.add(findingId)
		likedOrBookmarkedPages.push({ title, url })
	}
	return { likedOrBookmarkedPages, ratedDownPages: ratedDownPages.map(({ title, url }) => ({ title, url })) }
}

/**
 * Loads the pages that the score prompt shows as examples, in the order toScoreExamplePages gives them.
 */
export async function loadScoreExamplePages(topicId: string): Promise<ScoreExamplePages> {
	// the topic's owner and owning team decide whose bookmarks count
	const [topic] = await db
		.select({ ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return { likedOrBookmarkedPages: [], ratedDownPages: [] }
	}

	// the bookmarked findings and each finding's reaction signal, then the rated and reacted findings best-scored first
	const [bookmarkedFindingRows, findingReactionSignals] = await Promise.all([
		loadBookmarkedFindingRows(topicId, topic),
		loadFindingReactionSignals(topicId, topic.ownerId),
	])
	const reactedFindingIds = [...findingReactionSignals.keys()]
	const ratedOrReactedFindingRows = await db
		.select({ findingId: findings.id, title: resources.title, url: resources.url, rating: findings.rating })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(
			and(
				eq(findings.topicId, topicId),
				or(
					isNotNull(findings.rating),
					reactedFindingIds.length > 0 ? inArray(findings.id, reactedFindingIds) : undefined,
				),
			),
		)
		.orderBy(desc(findings.relevanceScore))
	return toScoreExamplePages({ bookmarkedFindingRows, ratedOrReactedFindingRows, findingReactionSignals })
}

/**
 * Loads the topic's findings that someone who still has access bookmarked, with their pages, newest bookmark first.
 */
export async function loadBookmarkedFindingRows(topicId: string, topic: BookmarkTopic): Promise<FindingPageRow[]> {
	// a bookmark counts if its user owns the topic or is an active member of a team that holds it
	const hasBookmarkUserAccess = or(
		eq(bookmarks.userId, topic.ownerId),
		topic.teamId
			? inArray(
					bookmarks.userId,
					db
						.select({ userId: teamMembers.userId })
						.from(teamMembers)
						.where(and(eq(teamMembers.teamId, topic.teamId), eq(teamMembers.isActive, true))),
				)
			: sql`false`,
		inArray(
			bookmarks.userId,
			db
				.select({ userId: teamMembers.userId })
				.from(teamMembers)
				.innerJoin(teamTopics, eq(teamTopics.teamId, teamMembers.teamId))
				.where(and(eq(teamTopics.topicId, topicId), eq(teamMembers.isActive, true))),
		),
	)

	// the bookmarked findings of the topic with their pages
	return (
		db
			.select({ findingId: bookmarks.findingId, title: resources.title, url: resources.url })
			.from(bookmarks)
			.innerJoin(findings, eq(bookmarks.findingId, findings.id))
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.where(and(eq(findings.topicId, topicId), hasBookmarkUserAccess))
			// one row per finding, ordered by its newest bookmark
			.groupBy(bookmarks.findingId, resources.title, resources.url)
			.orderBy(desc(max(bookmarks.createdAt)))
	)
}
