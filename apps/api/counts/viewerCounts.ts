// counting a topic's viewers and a podcast episode's listeners, and reading their counts for the pages

import { isCountedUserAgent } from "@carlnotes/contracts/userAgent"
import type { PodcastEpisodeCounts, TopicCounts } from "@carlnotes/contracts/viewerCounts"
import { db } from "@carlnotes/db"
import { countRateLimitHit } from "@carlnotes/db/redisRateLimits"
import { topics } from "@carlnotes/db/schema/topics"
import { addViewer, readViewerEstimate, type ViewerCountRef } from "@carlnotes/db/viewerCounts"
import { type RequestSender, toViewerElement } from "@carlnotes/server/viewerElements"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { loadAccessiblePodcastEpisode } from "../podcast/podcastEpisodeRows"
import { toRateLimitKey } from "../rateLimit"
import { gatedTopicColumns } from "../topic/permissions"
import { resolveClientAddress } from "../trustedProxies"

// how many views or listens one sender may send in a rate limit window of a minute
const COUNT_RATE_LIMIT = 30
const COUNT_RATE_LIMIT_WINDOW_MS = 60_000

// a page's counts, and whether the topic is public
type CountsResult<Counts> = { counts: Counts; isPublic: boolean }

// who sent a view or a listen, the name its rate limit counts under, and the count to run if the sender is within it
type CountWithinRateLimitOptions = { requestSender: RequestSender; rateLimitName: string; count: () => Promise<void> }

/**
 * Counts a view of the topic page, if the sender is a person who may view the topic. A crawler, a link unfurler, a
 * visitor with no address, and a Redis failure all count nothing.
 */
export async function countTopicView(requestSender: RequestSender, topicId: string): Promise<void> {
	const element = toCountedElement(requestSender)
	if (!element) {
		return
	}

	// count only a view of a topic the sender may see
	const [topicRow] = await db.select(gatedTopicColumns).from(topics).where(eq(topics.id, topicId))
	if (topicRow && (await isAllowed(requestSender.userId, "topic:view", topicRow))) {
		await addViewer({ kind: "topic", id: topicId }, element)
	}
}

/**
 * Counts a play or a download of a podcast episode the caller already checked access to. A crawler, a link unfurler,
 * a visitor with no address, and a Redis failure all count nothing.
 */
export async function countPodcastEpisodeListen(requestSender: RequestSender, podcastEpisodeId: string): Promise<void> {
	const element = toCountedElement(requestSender)
	if (element) {
		await addViewer({ kind: "podcastEpisode", id: podcastEpisodeId }, element)
	}
}

/**
 * Runs a view or a listen count if the sender is within the count rate limit.
 */
export async function countWithinRateLimit({
	requestSender,
	rateLimitName,
	count,
}: CountWithinRateLimitOptions): Promise<void> {
	const isWithinLimit = await countRateLimitHit({
		key: `rate-limit:${rateLimitName}:${toRateLimitKey(requestSender)}`,
		rateLimitWindowMs: COUNT_RATE_LIMIT_WINDOW_MS,
		limit: COUNT_RATE_LIMIT,
	})
	if (isWithinLimit) {
		await count()
	}
}

/**
 * Reads a topic's viewers and subscribers for someone who may view it, or null.
 */
export async function loadTopicCounts(
	userId: string | null,
	topicId: string,
): Promise<CountsResult<TopicCounts> | null> {
	// the topic's access fields and its saved counts
	const [topicRow] = await db
		.select({ ...gatedTopicColumns, viewerCount: topics.viewerCount, subscriberCount: topics.subscriberCount })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topicRow || !(await isAllowed(userId, "topic:view", topicRow))) {
		return null
	}

	// the viewers, and the subscribers the topic row already counts
	const viewerCount = await readViewerCount({ kind: "topic", id: topicId }, topicRow.viewerCount)
	return {
		counts: { viewerCount, subscriberCount: topicRow.subscriberCount },
		isPublic: topicRow.visibility === "public",
	}
}

/**
 * Reads a podcast episode's listeners for someone who may listen to it, or null.
 */
export async function loadPodcastEpisodeCounts(
	userId: string | null,
	podcastEpisodeId: string,
): Promise<CountsResult<PodcastEpisodeCounts> | null> {
	const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId })
	if (!accessiblePodcastEpisode) {
		return null
	}

	// the listeners, and whether the podcast episode's topic is public
	const listenerCount = await readViewerCount(
		{ kind: "podcastEpisode", id: podcastEpisodeId },
		accessiblePodcastEpisode.podcastEpisodeRow.listenerCount,
	)
	return { counts: { listenerCount }, isPublic: accessiblePodcastEpisode.topic.visibility === "public" }
}

/**
 * Returns who sent the request: the user that a feed token names if given, else the signed-in user, with the request's
 * address and user agent.
 */
export function toRequestSender(context: Context<AppEnv>, feedTokenUserId?: string): RequestSender {
	return {
		userId: feedTokenUserId ?? currentUser(context),
		clientAddress: resolveClientAddress(context.req.raw),
		userAgent: context.req.header("user-agent") ?? null,
	}
}

// the larger of the live estimate and the saved column, so a shown count never drops after a Redis restart
async function readViewerCount(viewerCountRef: ViewerCountRef, savedCount: number): Promise<number> {
	return Math.max((await readViewerEstimate(viewerCountRef)) ?? 0, savedCount)
}

// the element a counted sender adds, or null for a crawler, a link unfurler, or a visitor with no address
function toCountedElement(requestSender: RequestSender): string | null {
	return isCountedUserAgent(requestSender.userAgent) ? toViewerElement(requestSender) : null
}
