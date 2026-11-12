// counting the viewers of a topic, a profile, and a team and a podcast episode's listeners, buffering the day's views
// and plays into the daily counts, and reading the counts for the pages

import type { PodcastEpisodeFormat } from "@carlnotes/contracts/podcast"
import { isCountedUserAgent } from "@carlnotes/contracts/userAgent"
import type { PodcastEpisodeCounts, TopicCounts, ViewerCounts } from "@carlnotes/contracts/viewerCounts"
import { db } from "@carlnotes/db"
import { addDailyPlay, addDailyView } from "@carlnotes/db/dailyCountBuffer"
import { countRateLimitHit } from "@carlnotes/db/redisRateLimits"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { addViewer, readViewerEstimate, type ViewerCountRef } from "@carlnotes/db/viewerCounts"
import { type RequestSender, toViewerElement } from "@carlnotes/server/viewerElements"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { loadAccessiblePodcastEpisode } from "../podcast/podcastEpisodeRows"
import { toRateLimitKey } from "../rateLimit"
import { readRequestPlace } from "../requestPlace"
import { loadTeamPageAccess } from "../team/teamPageAccess"
import { gatedTopicColumns } from "../topic/permissions"
import { resolveClientAddress } from "../trustedProxies"

// how many views or listens one sender may send in a rate limit window of a minute
const COUNT_RATE_LIMIT = 30
const COUNT_RATE_LIMIT_WINDOW_MS = 60_000

// a page's counts, and whether the page is public: its topic, its team, or a profile, which always is
export type CountsResult<Counts> = { counts: Counts; isPublic: boolean }

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
		await Promise.all([
			addViewer({ kind: "topic", id: topicId }, element),
			addDailyView({ itemKind: "topic", itemId: topicId, element, place: requestSender.place }),
		])
	}
}

// who played or downloaded a podcast episode, the podcast episode, and its format
type CountPodcastEpisodeListenOptions = {
	requestSender: RequestSender
	podcastEpisodeId: string
	format: PodcastEpisodeFormat
}

/**
 * Counts a play or a download of a podcast episode in its format, which the caller already checked access to, among the
 * listeners and the day's plays. A crawler, a link unfurler, a visitor with no address, and a Redis failure all count
 * nothing.
 */
export async function countPodcastEpisodeListen({
	requestSender,
	podcastEpisodeId,
	format,
}: CountPodcastEpisodeListenOptions): Promise<void> {
	const element = toCountedElement(requestSender)
	if (element) {
		await Promise.all([
			addViewer({ kind: "podcastEpisode", id: podcastEpisodeId }, element),
			addDailyPlay({ podcastEpisodeId, format, element, place: requestSender.place }),
		])
	}
}

/**
 * Counts an open of a finding, whose access the caller already checked, among the day's views. A crawler, a link
 * unfurler, a visitor with no address, and a Redis failure all count nothing.
 */
export async function countFindingDailyView(requestSender: RequestSender, findingId: string): Promise<void> {
	const element = toCountedElement(requestSender)
	if (element) {
		await addDailyView({ itemKind: "finding", itemId: findingId, element, place: requestSender.place })
	}
}

/**
 * Counts a view of a user's profile page, which is public. A crawler, a link unfurler, a visitor with no address, an
 * id that names no user, and a Redis failure all count nothing.
 */
export async function countProfileView(requestSender: RequestSender, profileUserId: string): Promise<void> {
	const element = toCountedElement(requestSender)
	if (!element) {
		return
	}

	// count only a view of a profile that exists
	const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.id, profileUserId))
	if (userRow) {
		await addViewer({ kind: "profile", id: profileUserId }, element)
	}
}

/**
 * Counts a view of a team's page, if the sender is a person the page opens for. A crawler, a link unfurler, a visitor
 * with no address, and a Redis failure all count nothing.
 */
export async function countTeamView(requestSender: RequestSender, teamId: string): Promise<void> {
	const element = toCountedElement(requestSender)
	if (!element) {
		return
	}

	// count only a view of a team page the sender may open
	const teamPageAccess = await loadTeamPageAccess(requestSender.userId, teamId)
	if (teamPageAccess?.canOpen) {
		await addViewer({ kind: "team", id: teamId }, element)
	}
}

/**
 * Whether a sender is a person whose view counts: never a crawler, a link unfurler, or a visitor with no address.
 */
export function isCountedSender(requestSender: RequestSender): boolean {
	return toCountedElement(requestSender) !== null
}

/**
 * Runs a view or a listen count if the sender is within the count rate limit.
 */
export async function countWithinRateLimit({
	requestSender,
	rateLimitName,
	count,
}: CountWithinRateLimitOptions): Promise<void> {
	if (await countSenderRateLimitHit(requestSender, rateLimitName)) {
		await count()
	}
}

/**
 * Counts one hit against the sender's count rate limit, and returns whether the sender is within it.
 */
export function countSenderRateLimitHit(requestSender: RequestSender, rateLimitName: string): Promise<boolean> {
	return countRateLimitHit({
		key: `rate-limit:${rateLimitName}:${toRateLimitKey(requestSender)}`,
		rateLimitWindowMs: COUNT_RATE_LIMIT_WINDOW_MS,
		limit: COUNT_RATE_LIMIT,
	})
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
 * Reads a profile's viewers, or null if the id names no user. A profile is public, so anyone reads its count.
 */
export async function loadProfileViewerCounts(profileUserId: string): Promise<CountsResult<ViewerCounts> | null> {
	const [userRow] = await db
		.select({ profileViewerCount: users.profileViewerCount })
		.from(users)
		.where(eq(users.id, profileUserId))
	if (!userRow) {
		return null
	}

	// the larger of the live estimate and the saved column
	const viewerCount = await readViewerCount({ kind: "profile", id: profileUserId }, userRow.profileViewerCount)
	return { counts: { viewerCount }, isPublic: true }
}

/**
 * Reads a team's viewers for someone its page opens for, or null.
 */
export async function loadTeamViewerCounts(
	userId: string | null,
	teamId: string,
): Promise<CountsResult<ViewerCounts> | null> {
	const teamPageAccess = await loadTeamPageAccess(userId, teamId)
	if (!teamPageAccess?.canOpen) {
		return null
	}

	// the larger of the live estimate and the saved column, and whether the team is public
	const { team } = teamPageAccess
	const viewerCount = await readViewerCount({ kind: "team", id: teamId }, team.viewerCount)
	return { counts: { viewerCount }, isPublic: team.isPublic }
}

/**
 * Returns who sent the request: the user that a feed token names if given, else the signed-in user, with the request's
 * address, user agent, and place.
 */
export function toRequestSender(context: Context<AppEnv>, feedTokenUserId?: string): RequestSender {
	return {
		userId: feedTokenUserId ?? currentUser(context),
		clientAddress: resolveClientAddress(context.req.raw),
		userAgent: context.req.header("user-agent") ?? null,
		place: readRequestPlace(context.req.raw),
	}
}

/**
 * Returns the larger of the live estimate and the saved column, so a shown count never drops after a Redis restart.
 */
export async function readViewerCount(viewerCountRef: ViewerCountRef, savedCount: number): Promise<number> {
	return Math.max((await readViewerEstimate(viewerCountRef)) ?? 0, savedCount)
}

/**
 * Returns the element a counted sender adds, or null for a crawler, a link unfurler, or a visitor with no address.
 */
export function toCountedElement(requestSender: RequestSender): string | null {
	return isCountedUserAgent(requestSender.userAgent) ? toViewerElement(requestSender) : null
}
