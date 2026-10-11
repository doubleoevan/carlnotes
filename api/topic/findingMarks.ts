// the marks a user puts on a topic finding: the rating and its feedback, the bookmark, consumed, and a view
import { trackEvent } from "@shared/analytics"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { bookmarks, consumptions, findingFeedback, findings, findingViews } from "../../db/schema/scans"
import { topics } from "../../db/schema/topics"
import type { AnalyticsProperties } from "../currentUser"
import { canBookmarkFinding, canRateFinding, isTopicFindingVisible, toTopicRole } from "./permissions"

/**
 * Set a topic finding's rating to thumbs up or down, or clear it. Returns false when the user may not rate.
 */
export async function setRating(
	userId: string,
	findingId: string,
	rating: "up" | "down" | null,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	// only a rater may write, then the rating is written in one update
	if (!(await canRateFinding(userId, findingId))) {
		return false
	}

	// the rating records who set it, the topic's team, and their role at that moment
	const snapshot = rating === null ? emptySnapshot() : await toRatingSnapshot(userId, findingId)
	await db
		.update(findings)
		.set({ rating, ...snapshot })
		.where(eq(findings.id, findingId))

	// track the rating event. clearing a rating is not one
	if (rating !== null) {
		trackEvent("finding_rated", userId, analyticsProperties)
	}
	return true
}

// the cleared snapshot a removed rating writes
function emptySnapshot(): { ratedByUserId: null; ratedTeamId: null; ratedRole: null } {
	return { ratedByUserId: null, ratedTeamId: null, ratedRole: null }
}

// the snapshot a rating records: who rated, the topic's team, and the role held at that moment
async function toRatingSnapshot(
	userId: string,
	findingId: string,
): Promise<{ ratedByUserId: string; ratedTeamId: string | null; ratedRole: string | null }> {
	// the finding's topic names the team, and the role resolver names what the rater is to it
	const [topicRow] = await db
		.select({ id: topics.id, ownerId: topics.ownerId, teamId: topics.teamId })
		.from(findings)
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.where(eq(findings.id, findingId))
	const role = topicRow ? await toTopicRole(userId, topicRow) : null
	return { ratedByUserId: userId, ratedTeamId: topicRow?.teamId ?? null, ratedRole: role }
}

// the user, the finding, the feedback as written, and the request's analytics properties
type SaveFindingFeedbackOptions = {
	userId: string
	findingId: string
	feedback: string
	analyticsProperties: AnalyticsProperties
}

/**
 * Saves a user's own words about a finding, recording only, and returns false if the user may not rate it.
 */
export async function saveFindingFeedback({
	userId,
	findingId,
	feedback,
	analyticsProperties,
}: SaveFindingFeedbackOptions): Promise<boolean> {
	// the same permission check rating uses. feedback is a label like a thumb
	if (!(await canRateFinding(userId, findingId))) {
		return false
	}

	// save the words as written against the finding and its topic, and report the finding, never the words
	const [findingRow] = await db.select({ topicId: findings.topicId }).from(findings).where(eq(findings.id, findingId))
	if (!findingRow) {
		return false
	}
	await db.insert(findingFeedback).values({ findingId, topicId: findingRow.topicId, userId, feedback })
	trackEvent("finding_feedback_sent", userId, { ...analyticsProperties, topicId: findingRow.topicId, findingId })
	return true
}

/**
 * Bookmark or unbookmark a topic finding for the user. Bookmarking returns false unless the user owns the topic
 * or actively belongs to a team holding it. Unbookmarking always succeeds, so an older bookmark can still be removed.
 */
export async function setBookmarked(
	userId: string,
	findingId: string,
	isBookmarked: boolean,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	// unbookmarking always removes this user's own row
	if (!isBookmarked) {
		const deletedBookmarks = await db
			.delete(bookmarks)
			.where(and(eq(bookmarks.userId, userId), eq(bookmarks.findingId, findingId)))
			.returning({ id: bookmarks.id })

		// a repeated unbookmark deletes nothing, so it reports nothing
		if (deletedBookmarks.length > 0) {
			trackEvent("finding_unbookmarked", userId, analyticsProperties)
		}
		return true
	}

	// bookmarking takes the owner or an active member of a team holding the topic. a duplicate insert does nothing
	if (!(await canBookmarkFinding(userId, findingId))) {
		return false
	}
	const insertedBookmarks = await db
		.insert(bookmarks)
		.values({ userId, findingId })
		.onConflictDoNothing()
		.returning({ id: bookmarks.id })

	// track the event for analytics
	if (insertedBookmarks.length > 0) {
		trackEvent("finding_bookmarked", userId, analyticsProperties)
	}
	return true
}

/**
 * Mark or unmark a topic finding consumed. Returns false when the user may not see it.
 */
export async function setConsumed(
	userId: string,
	findingId: string,
	isConsumed: boolean,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	if (!(await isTopicFindingVisible(userId, findingId))) {
		return false
	}
	// marking read without ever opening is a dismissal, recorded as its own view event
	if (isConsumed) {
		const [openedView] = await db
			.select({ id: findingViews.id })
			.from(findingViews)
			.where(
				and(eq(findingViews.findingId, findingId), eq(findingViews.userId, userId), isNotNull(findingViews.openedAt)),
			)
			.limit(1)
		if (!openedView) {
			await db.insert(findingViews).values({ findingId, userId, dismissedAt: new Date() })
		}
	}
	await saveTopicFindingConsumed(userId, findingId, isConsumed)

	// track the event for analytics
	trackEvent(isConsumed ? "finding_read" : "finding_unread", userId, analyticsProperties)
	return true
}

/**
 * Increment the topic finding's view count and mark it consumed. Returns false when the user may not see it.
 */
export async function recordView(
	userId: string,
	findingId: string,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	if (!(await isTopicFindingVisible(userId, findingId))) {
		return false
	}

	// increment the view count with a raw SQL expression, then mark the finding consumed
	await db
		.update(findings)
		.set({ viewCount: sql`${findings.viewCount} + 1` })
		.where(eq(findings.id, findingId))
	await saveTopicFindingConsumed(userId, findingId, true)

	// the open finding's view event, recording only. nothing reads these for scoring
	await db.insert(findingViews).values({ findingId, userId, openedAt: new Date() })

	// track the event for analytics
	trackEvent("finding_opened", userId, analyticsProperties)
	return true
}

// insert or delete the consumed row, with the access check already run by the exported callers
async function saveTopicFindingConsumed(userId: string, findingId: string, isConsumed: boolean): Promise<void> {
	// to unmark isConsumed, delete the topic finding's consumed row
	if (!isConsumed) {
		await db.delete(consumptions).where(and(eq(consumptions.userId, userId), eq(consumptions.findingId, findingId)))
		return
	}

	// to mark isConsumed, insert the topic finding's consumed row. a duplicate insert does nothing
	await db.insert(consumptions).values({ userId, findingId }).onConflictDoNothing()
}
