// the feedback a user gives a topic finding: the rating and its words, the bookmark, consumed, and a view

import { type DbHandle, db } from "@carlnotes/db"
import { bookmarks, consumptions, findingFeedback, findings, findingViews } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import type { AnalyticsProperties } from "../currentUser"
import { canBookmarkFinding, canRateFinding, isTopicFindingVisible } from "./findingPermissions"
import { toTopicRole } from "./permissions"
import { saveTopicVectorsReportingFailure } from "./saveTopic"

/**
 * Sets a topic finding's rating to thumbs up or down, or clears it, and saves its topic's vectors again. Returns false
 * if the user may not rate.
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
	const [ratedFindingRow] = await db
		.update(findings)
		.set({ rating, ...snapshot })
		.where(eq(findings.id, findingId))
		.returning({ topicId: findings.topicId })

	// save the topic's vectors again. a rating to or from down changes its mean and its shown count, and a failed save
	// is reported and never fails the rating
	if (ratedFindingRow) {
		await saveTopicVectorsReportingFailure(ratedFindingRow.topicId)
	}

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
 * Marks or unmarks a topic finding consumed. Returns false if the user may not see it.
 */
export async function setConsumed(
	userId: string,
	findingId: string,
	isConsumed: boolean,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	// reject a finding the user may not see
	if (!(await isTopicFindingVisible(userId, findingId))) {
		return false
	}

	// a consumption goes through the one write that stores consumptions
	if (isConsumed) {
		await setFindingsConsumed(userId, [findingId], analyticsProperties)
		return true
	}
	await saveTopicFindingConsumed(userId, findingId, false)

	// track the event for analytics
	trackEvent("finding_unread", userId, analyticsProperties)
	return true
}

/**
 * Marks many topic findings consumed for one user in one write, which stores what a single consumption stores, and
 * tracks one event with the count. The caller has checked that the user may see every finding.
 */
export async function setFindingsConsumed(
	userId: string,
	findingIds: string[],
	analyticsProperties: AnalyticsProperties,
): Promise<void> {
	if (findingIds.length === 0) {
		return
	}

	// a consumption on a finding never opened is a dismissal, recorded as its own view event
	await db.transaction(async (transaction) => {
		const openedFindingIds = await loadOpenedFindingIds(transaction, userId, findingIds)
		const dismissedFindingIds = findingIds.filter((findingId) => !openedFindingIds.has(findingId))
		if (dismissedFindingIds.length > 0) {
			await transaction
				.insert(findingViews)
				.values(dismissedFindingIds.map((findingId) => ({ findingId, userId, dismissedAt: new Date() })))
		}
		// give every Finding its consumed row and skip a row that already exists
		await transaction
			.insert(consumptions)
			.values(findingIds.map((findingId) => ({ userId, findingId })))
			.onConflictDoNothing()
	})

	// track the one event for analytics
	trackEvent("finding_read", userId, { ...analyticsProperties, findingCount: findingIds.length })
}

// who opened which finding, the open's analytics properties, and whether the open counts among the finding's views,
// which an open past the count rate limit does not
type RecordViewOptions = {
	userId: string
	findingId: string
	analyticsProperties: AnalyticsProperties
	isViewCounted: boolean
}

/**
 * Records an open of the topic finding, counts it among the finding's views if it is counted, and marks it consumed.
 * Returns false if the user may not see it.
 */
export async function recordView({
	userId,
	findingId,
	analyticsProperties,
	isViewCounted,
}: RecordViewOptions): Promise<boolean> {
	if (!(await isTopicFindingVisible(userId, findingId))) {
		return false
	}

	// count the open among the finding's views, and record its view event. a finding deleted since the visibility check
	// records nothing. nothing reads view events for scoring
	if (isViewCounted) {
		if (!(await addFindingView(findingId))) {
			return false
		}
		await db.insert(findingViews).values({ findingId, userId, openedAt: new Date() })
	}
	await saveTopicFindingConsumed(userId, findingId, true)

	// track the event for analytics
	trackEvent("finding_opened", userId, analyticsProperties)
	return true
}

/**
 * Counts a visitor's open of a topic finding among its views, if a visitor may see it, and returns whether it counted.
 * A visitor has no read state, so nothing else is recorded.
 */
export async function countVisitorFindingView(findingId: string): Promise<boolean> {
	return (await isTopicFindingVisible(null, findingId)) && (await addFindingView(findingId))
}

// add one to the finding's views, returning false if the finding is gone
async function addFindingView(findingId: string): Promise<boolean> {
	const [viewedFindingRow] = await db
		.update(findings)
		.set({ viewCount: sql`${findings.viewCount} + 1` })
		.where(eq(findings.id, findingId))
		.returning({ id: findings.id })
	return viewedFindingRow !== undefined
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

// which of the findings the user has opened
async function loadOpenedFindingIds(handle: DbHandle, userId: string, findingIds: string[]): Promise<Set<string>> {
	const openedViews = await handle
		.selectDistinct({ findingId: findingViews.findingId })
		.from(findingViews)
		.where(
			and(
				inArray(findingViews.findingId, findingIds),
				eq(findingViews.userId, userId),
				isNotNull(findingViews.openedAt),
			),
		)
	return new Set(openedViews.map((openedView) => openedView.findingId))
}
