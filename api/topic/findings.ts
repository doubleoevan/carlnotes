// the topic findings read for a page or a feed, the finding shape, and the per-finding routes
import { zValidator } from "@hono/zod-validator"
import type { TopicFinding } from "@shared/contracts/findings"
import { reportThresholdCrossing } from "@shared/monitoring"
import { bookmarkPayload, consumedPayload, findingFeedbackPayload, ratingPayload } from "@shared/payloads"
import { toUrlHost } from "@shared/sources"
import { and, desc, eq, gt, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db, isFindingShown } from "../../db"
import { bookmarks, consumptions, findings, resources, scans } from "../../db/schema/scans"
import { loadOrFetchLinkPreview } from "../chat/linkPreviews"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { recordView, saveFindingFeedback, setBookmarked, setConsumed, setRating } from "./findingMarks"
import { isTopicFindingVisible } from "./permissions"

// the most findings one read of a topic returns, about forty times the largest topic in production
export const TOPIC_FINDINGS_READ_LIMIT = 1000

// one page of a topic's findings in relevance order: the row it starts at and how many rows it reads
export type FindingPageWindow = { offset: number; rowCount: number }

// the topic whose findings are read, the user reading them, the invite gate, and an optional page window
type LoadTopicFindingsOptions = {
	topicId: string
	userId: string | null
	// when an invite topic's subscription activated. null reads no findings, and undefined skips the gate
	subscriberActivatedAt?: Date | null
	// one page of the findings, which can reach past the read limit
	pageWindow?: FindingPageWindow
	// whether to leave out the findings rated thumbs down
	isRatedDownExcluded?: boolean
}

/**
 * Loads a topic's findings joined to their resources with the user's consumed state, most relevant first,
 * up to the read limit or within one page window.
 * An "invite" visibility topic requires a subscription activation date to load findings, and a read that reaches the limit sends a warning.
 */
export async function loadTopicFindings({
	topicId,
	userId,
	subscriberActivatedAt,
	pageWindow,
	isRatedDownExcluded = false,
}: LoadTopicFindingsOptions): Promise<TopicFinding[]> {
	// no active subscription on an invite topic means no findings at all
	if (subscriberActivatedAt === null) {
		return []
	}

	// the activation gate keeps only findings whose scan started after the user's subscription activated,
	// and a read that leaves out the findings rated thumbs down keeps only the shown findings
	const topicFindingFilter = subscriberActivatedAt
		? and(eq(findings.topicId, topicId), gt(scans.startedAt, subscriberActivatedAt))
		: eq(findings.topicId, topicId)
	const findingFilter = isRatedDownExcluded ? and(topicFindingFilter, isFindingShown) : topicFindingFilter

	// a user's own columns are consumed and bookmarked. a visitor's are null
	const userColumns = userId
		? { consumedAt: consumptions.consumedAt, bookmarkedAt: bookmarks.createdAt }
		: { consumedAt: sql<Date | null>`null`, bookmarkedAt: sql<Date | null>`null` }

	// join each topic finding with its resource and its scan
	const findingQuery = db
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
			...userColumns,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.innerJoin(scans, eq(findings.scanId, scans.id))
		.$dynamic()

	// left join a user's consumed and bookmark rows. a visitor skips the join
	const markedQuery = userId
		? findingQuery
				.leftJoin(consumptions, and(eq(consumptions.findingId, findings.id), eq(consumptions.userId, userId)))
				.leftJoin(bookmarks, and(eq(bookmarks.findingId, findings.id), eq(bookmarks.userId, userId)))
		: findingQuery

	// the most relevant first, with the id breaking ties so every page window reads the same order
	const findingRows = await markedQuery
		.where(findingFilter)
		.orderBy(desc(findings.relevanceScore), findings.id)
		.limit(pageWindow?.rowCount ?? TOPIC_FINDINGS_READ_LIMIT)
		.offset(pageWindow?.offset ?? 0)

	// a whole topic's read that reaches the limit is reported, so the limit can be raised before a real topic reaches it
	if (!pageWindow && findingRows.length >= TOPIC_FINDINGS_READ_LIMIT) {
		reportThresholdCrossing({
			condition: "topic-findings-read-limit",
			message: "a topic's finding read reached its limit",
			values: { findingCount: findingRows.length, readLimit: TOPIC_FINDINGS_READ_LIMIT },
		})
	}

	// shape each row into a topic finding and set its isConsumed flag
	return findingRows.map(toTopicFinding)
}

// the joined row a finding read returns: the finding, its resource metadata, and the user's own columns
export type TopicFindingRow = {
	findingId: string
	scanId: string
	resourceId: string
	url: string
	resourceKind: TopicFinding["resourceKind"]
	title: TopicFinding["title"]
	// the resource's dates
	resourceCreatedAt: Date
	fetchedAt: Date
	// the relevance, view count, rating, engagement, and the user's own columns
	relevanceScore: TopicFinding["relevanceScore"]
	relevanceExplanation: TopicFinding["relevanceExplanation"]
	viewCount: TopicFinding["viewCount"]
	rating: TopicFinding["rating"]
	engagement: TopicFinding["engagement"]
	consumedAt: Date | null
	bookmarkedAt: Date | null
}

/** Shapes one joined finding row into a TopicFinding, with the user's marks set. */
export function toTopicFinding(findingRow: TopicFindingRow): TopicFinding {
	return {
		findingId: findingRow.findingId,
		scanId: findingRow.scanId,
		resourceId: findingRow.resourceId,
		url: findingRow.url,
		resourceKind: findingRow.resourceKind,
		title: findingRow.title,
		// the source host for the metadata, its favicon path, and the published and fetched times
		source: toUrlHost(findingRow.url),
		faviconPath: null,
		publishedAt: findingRow.resourceCreatedAt.toISOString(),
		fetchedAt: findingRow.fetchedAt.toISOString(),
		// the relevance explanation, view count, rating, engagement, and the user's consumed and bookmarked states
		relevanceScore: findingRow.relevanceScore,
		relevanceExplanation: findingRow.relevanceExplanation,
		viewCount: findingRow.viewCount,
		rating: findingRow.rating,
		engagement: findingRow.engagement,
		isConsumed: findingRow.consumedAt !== null,
		isBookmarked: findingRow.bookmarkedAt !== null,
		teamBookmarks: [],
	}
}

/**
 * The default topic feed hides consumed topic findings. The "All" view keeps them.
 */
export function filteredTopicFindings(topicFindings: TopicFinding[], includeConsumed: boolean): TopicFinding[] {
	return includeConsumed ? topicFindings : topicFindings.filter((finding) => !finding.isConsumed)
}

/**
 * "# new" is the count of topic findings that the user has not consumed, leaving out the findings rated thumbs down.
 */
export function newTopicFindingCount(topicFindings: TopicFinding[]): number {
	return topicFindings.filter((finding) => !finding.isConsumed && finding.rating !== "down").length
}

// the per-finding routes. rating, consume, bookmark, and record a view need a signed-in user.
// the link preview card the topic finding popup shows is for anyone who can see the finding
export const findingsRoute = new Hono<AppEnv>()
	.get("/topic-findings/:id/link-preview", async (context) => {
		// a visitor sees the card wherever they can see a topic finding
		const userId = currentUser(context)
		if (!(await isTopicFindingVisible(userId, context.req.param("id")))) {
			return context.json({ error: "not found" }, 404)
		}

		// the topic finding's page resolves through the shared link preview cache
		const [findingRow] = await db
			.select({ url: resources.url })
			.from(findings)
			.innerJoin(resources, eq(resources.id, findings.resourceId))
			.where(eq(findings.id, context.req.param("id")))
		// a topic finding whose resource is gone has no page to preview
		if (!findingRow) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json({ linkPreview: await loadOrFetchLinkPreview(findingRow.url) })
	})
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
		// bookmark or unbookmark this topic finding for the current user
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
		const isFindingFeedbackSaved = await saveFindingFeedback({
			userId,
			findingId: context.req.param("id"),
			feedback: context.req.valid("json").feedback,
			analyticsProperties: toAnalyticsProperties(context),
		})
		return isFindingFeedbackSaved ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
