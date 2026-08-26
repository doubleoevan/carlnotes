import { zValidator } from "@hono/zod-validator"
// the topic finding logic behind the api routes
import { trackEvent } from "@shared/analytics"
import type { TopicFinding } from "@shared/contracts"
import { bookmarkPayload, consumedPayload, findingFeedbackPayload, ratingPayload } from "@shared/contracts"
import { toUrlHost } from "@shared/sources"
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import {
	bookmarks,
	consumptions,
	findingFeedback,
	findings,
	findingViews,
	resources,
	scans,
	topics,
} from "../../db/schema"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { canBookmarkFinding, canRateFinding, isTopicFindingVisible, toTopicRole } from "./permissions"

/**
 * Load a topic's findings joined to their resources with the user's consumed state, most relevant first.
 * An "invite" visibility topic requires a subscription activation date to load findings.
 */
export async function loadTopicFindings(
	topicId: string,
	userId: string | null,
	subscriberActivatedAt?: Date | null,
): Promise<TopicFinding[]> {
	// no active subscription on an invite topic means no findings at all
	if (subscriberActivatedAt === null) {
		return []
	}

	// a signed-out visitor has no history. sql`false` stands in where drizzle's typing rejects comparing user_id to null
	const consumptionJoinCondition = userId
		? and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId))
		: sql`false`
	const bookmarkJoinCondition = userId
		? and(eq(bookmarks.findingId, findings.id), eq(bookmarks.userId, userId))
		: sql`false`

	// the activation gate keeps only findings whose scan started after the user's subscription activated
	const findingFilter = subscriberActivatedAt
		? and(eq(findings.topicId, topicId), gt(scans.startedAt, subscriberActivatedAt))
		: eq(findings.topicId, topicId)

	// join each topic finding with its resource. a left join adds the user's consumed date when one exists
	const findingRows = await db
		.select({
			// load the finding identity, the scan that produced it, and its resource metadata
			findingId: findings.id,
			scanId: findings.scanId,
			resourceId: resources.id,
			url: resources.url,
			resourceKind: resources.kind,
			title: resources.title,
			resourceCreatedAt: resources.createdAt,
			fetchedAt: resources.fetchedAt,

			// load the finding metadata, the engagement score for trending, and the user's consumed and bookmarked dates
			relevanceScore: findings.relevanceScore,
			relevanceExplanation: findings.relevanceExplanation,
			viewCount: findings.viewCount,
			rating: findings.rating,
			engagement: resources.engagement,
			consumedAt: consumptions.consumedAt,
			bookmarkedAt: bookmarks.createdAt,
		})
		// join the resource, the finding's scan for the activation gate, and the user's consumed and bookmark rows
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.innerJoin(scans, eq(findings.scanId, scans.id))
		.leftJoin(consumptions, consumptionJoinCondition)
		.leftJoin(bookmarks, bookmarkJoinCondition)
		.where(findingFilter)
		.orderBy(desc(findings.relevanceScore))

	// shape each row into a topic finding and set its isConsumed flag
	return findingRows.map((findingRow) => ({
		findingId: findingRow.findingId,
		scanId: findingRow.scanId,
		resourceId: findingRow.resourceId,
		url: findingRow.url,
		resourceKind: findingRow.resourceKind,
		title: findingRow.title,
		// the source host for the metadata, plus the published and fetched times
		source: toUrlHost(findingRow.url),
		publishedAt: findingRow.resourceCreatedAt.toISOString(),
		fetchedAt: findingRow.fetchedAt.toISOString(),
		// the relevance judgment, view count, rating, engagement, and the user's consumed and bookmarked states
		relevanceScore: findingRow.relevanceScore,
		relevanceExplanation: findingRow.relevanceExplanation,
		viewCount: findingRow.viewCount,
		rating: findingRow.rating,
		engagement: findingRow.engagement,
		isConsumed: findingRow.consumedAt !== null,
		isBookmarked: findingRow.bookmarkedAt !== null,
		teamBookmarks: [],
	}))
}

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

/**
 * Store a user's own words about a finding. Recording only: no extraction, no effect on scoring.
 */
export async function saveFindingFeedback(userId: string, findingId: string, feedback: string): Promise<boolean> {
	// the same permission check rating uses. feedback is a label like a thumb
	if (!(await canRateFinding(userId, findingId))) {
		return false
	}

	// the words as written, against the finding and its topic
	const [findingRow] = await db.select({ topicId: findings.topicId }).from(findings).where(eq(findings.id, findingId))
	if (!findingRow) {
		return false
	}
	await db.insert(findingFeedback).values({ findingId, topicId: findingRow.topicId, userId, feedback })
	return true
}

/**
 * Bookmark or unbookmark a topic finding for the user. Bookmarking returns false unless the user owns the topic.
 * Unbookmarking always succeeds, so a bookmark held from before the owner rule can still be removed.
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

	// bookmarking requires this user to own the topic. a duplicate insert does nothing
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

/**
 * The default topic feed hides consumed topic findings. The "All" view keeps them.
 */
export function filteredTopicFindings(topicFindings: TopicFinding[], includeConsumed: boolean): TopicFinding[] {
	return includeConsumed ? topicFindings : topicFindings.filter((finding) => !finding.isConsumed)
}

/**
 * "# new" is the count of topic findings that the user has not consumed.
 */
export function newTopicFindingCount(topicFindings: TopicFinding[]): number {
	return topicFindings.filter((finding) => !finding.isConsumed).length
}

// the per-finding routes a signed-in user drives: rating, consumed, bookmarked, and the view an open records
export const findingsRoute = new Hono<AppEnv>()
	.post("/topic-findings/:id/rating", zValidator("json", ratingPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// rate this topic finding up, down, or clear the rating
		const rating = context.req.valid("json").rating
		const isRated = await setRating(userId, context.req.param("id"), rating, toAnalyticsProperties(context))
		return isRated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/consume", zValidator("json", consumedPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// mark this topic finding consumed or unread for the current user
		const { isConsumed: isMarkedConsumed } = context.req.valid("json")
		const isConsumed = await setConsumed(
			userId,
			context.req.param("id"),
			isMarkedConsumed,
			toAnalyticsProperties(context),
		)
		return isConsumed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/bookmark", zValidator("json", bookmarkPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// bookmark or unbookmark this topic finding for the current user, keeping the count below the max results
		const { isBookmarked } = context.req.valid("json")
		const isBookmarkSet = await setBookmarked(
			userId,
			context.req.param("id"),
			isBookmarked,
			toAnalyticsProperties(context),
		)
		return isBookmarkSet ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/view", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// opening a resource records a view on its topic finding and marks the finding consumed
		const isViewed = await recordView(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isViewed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/feedback", zValidator("json", findingFeedbackPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// store the words as written. recording only
		const isSaved = await saveFindingFeedback(userId, context.req.param("id"), context.req.valid("json").feedback)
		return isSaved ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
