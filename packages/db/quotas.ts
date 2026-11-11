// per-user limits, the month's spend, and the podcast episode checks
import { dailyFrequencies, isAdminRole } from "@carlnotes/contracts/enums"
import {
	ADMIN_QUOTA,
	type OverageBillingAccess,
	PLANS,
	toCentsFromDollars,
	type UserAccess,
} from "@carlnotes/contracts/plans"
import { DAY_MS } from "@carlnotes/contracts/time"
import { and, count, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { countRateLimitHit } from "./redisRateLimits"
import { memoizeInRequest } from "./requestMemo"
import { billingSubscriptions } from "./schema/billing"
import { chatTurns } from "./schema/chat"
import { personalSourcesSummarySpends } from "./schema/personalSources"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "./schema/podcast"
import { scans } from "./schema/scans"
import { teamMembers } from "./schema/teams"
import { topicImageRenders } from "./schema/topicImages"
import { topicPostDiscussions } from "./schema/topicPosts"
import { topics } from "./schema/topics"
import { users } from "./schema/users"

// a recorded spend in dollars, split into scans, chat, and podcast episodes, which include Topic Post Discussions
export type RecordedSpend = {
	scanDollars: number
	chatDollars: number
	podcastEpisodeDollars: number
	personalSourcesDollars: number
	topicImageDollars: number
}

// when the spend to sum starts, and the one user whose spend to sum, or every user if unset
export type LoadSpendSinceOptions = { since: Date; userId?: string }

// how many teams a user may create in a day
const DAILY_TEAM_LIMIT = 20

// how many source-suggestion model calls a user may make in a day, so nobody drains the budget on suggestions
const DAILY_SUGGESTION_LIMIT = 30

/**
 * Counts one suggestion against the user's UTC day and returns whether the suggestion is within the daily limit.
 * An admin bypasses the limit.
 */
export async function incrementDaySuggestionCount(userId: string): Promise<boolean> {
	// an admin is not limited, so their count is never incremented
	const { isAdmin } = await loadUserAccess(userId)
	if (isAdmin) {
		return true
	}

	// count the suggestion in today's rate limit window and return whether the count is within the daily limit
	return countRateLimitHit({
		key: toSuggestionRateLimitWindowKey(userId, new Date()),
		rateLimitWindowMs: DAY_MS,
		limit: DAILY_SUGGESTION_LIMIT,
	})
}

/**
 * Returns the Redis key for a user's suggestion count on the UTC day of the given time.
 */
export function toSuggestionRateLimitWindowKey(userId: string, now: Date): string {
	return `suggestions:${toUtcDay(now)}:${userId}`
}

/**
 * Returns the user's admin status, billing plan, budget override, and admin block, read at most once per request.
 */
export function loadUserAccess(userId: string, transaction?: DbHandle): Promise<UserAccess> {
	if (transaction && transaction !== db) {
		return readUserAccess(userId, transaction)
	}
	return memoizeInRequest(`user-access:${userId}`, () => readUserAccess(userId, db))
}

// read current authority through the caller's connection while a transaction holds its locks
async function readUserAccess(userId: string, handle: DbHandle): Promise<UserAccess> {
	const [user] = await handle
		.select({
			role: users.role,
			plan: users.plan,
			budgetOverrideCents: users.budgetOverrideCents,
			freeTopicLimit: users.freeTopicLimit,
			adminBlockedAt: users.adminBlockedAt,
		})
		.from(users)
		.where(eq(users.id, userId))
	return {
		isAdmin: isAdminRole(user?.role),
		isAdminBlocked: Boolean(user?.adminBlockedAt),
		plan: user?.plan ?? "free",
		budgetOverrideCents: user?.budgetOverrideCents ?? null,
		freeTopicLimit: user?.freeTopicLimit ?? PLANS.free.topicLimit,
	}
}

// how many topic scans ran for the user since utc midnight, scheduled and manual combined
export async function scansToday(userId: string): Promise<number> {
	// count every non-failed scan inside the utc day
	const [scanCountRow] = await db
		.select({ count: count() })
		.from(scans)
		.where(
			and(
				eq(scans.ownerId, userId),
				ne(scans.status, "failed"),
				isNull(scans.stoppedAt),
				gte(scans.startedAt, startOfUtcDay(new Date())),
			),
		)
	return scanCountRow?.count ?? 0
}

// remaining scans the user may still run today under their plan. admins are effectively unlimited
export async function scansRemainingToday(userId: string): Promise<number> {
	// admins bypass the quota, everyone else gets their plan's daily limit minus what already ran today
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// the monthly or yearly billing interval selects which of the plan's daily limits applies
	const [{ billingInterval }, scansUsedToday] = await Promise.all([loadBillingAccess(userId), scansToday(userId)])
	return Math.max(0, PLANS[plan].dailyScanLimit[billingInterval] - scansUsedToday)
}

/**
 * The plan's daily scan limit for this user, which a page pairs with what is left to say how many ran.
 * An admin bypasses the limit, so their limit reads as the admin quota.
 */
export async function dailyScanLimit(userId: string): Promise<number> {
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}
	// the plan's daily limit depends on the monthly or yearly billing interval, like the remaining count
	const { billingInterval } = await loadBillingAccess(userId)
	return PLANS[plan].dailyScanLimit[billingInterval]
}

/**
 * Whether the user may create one more team today. Admins bypass the limit.
 */
export async function canCreateTeamToday(userId: string): Promise<boolean> {
	// an admin has no limit
	const { isAdmin } = await loadUserAccess(userId)
	if (isAdmin) {
		return true
	}

	// count how many teams this user created since utc midnight
	const [teamCountRow] = await db
		.select({ count: count() })
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.userId, userId),
				eq(teamMembers.role, "leader"),
				eq(teamMembers.isActive, true),
				gte(teamMembers.createdAt, startOfUtcDay(new Date())),
			),
		)

	// return whether their team count is below the daily limit
	return (teamCountRow?.count ?? 0) < DAILY_TEAM_LIMIT
}

/**
 * Returns who bills the user's subscription, how often, and whether a card is on file, or no provider for a free user.
 */
export async function loadBillingAccess(userId: string, handle: DbHandle = db): Promise<OverageBillingAccess> {
	const [subscriptionRow] = await handle
		.select({
			provider: billingSubscriptions.provider,
			hasPaymentMethod: billingSubscriptions.hasPaymentMethod,
			billingInterval: billingSubscriptions.billingInterval,
		})
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	return {
		provider: subscriptionRow?.provider ?? null,
		hasPaymentMethod: subscriptionRow?.hasPaymentMethod ?? false,
		billingInterval: subscriptionRow?.billingInterval ?? "monthly",
	}
}

// how many image regenerations the user has run this UTC month, and how many the plan allows
export type ImageRegenerationQuota = { used: number; limit: number; remaining: number }

/**
 * Returns the user's image regenerations this UTC month against their plan's limit. An admin has the admin quota.
 */
export async function loadTopicImageRegenerationQuota(userId: string): Promise<ImageRegenerationQuota> {
	// count the owner's regenerate rows since the month began, beside the plan that limits them
	const since = startOfUtcMonth(new Date())
	const [userAccess, [usedRow]] = await Promise.all([
		loadUserAccess(userId),
		db
			.select({ used: count() })
			.from(topicImageRenders)
			.where(
				and(
					eq(topicImageRenders.userId, userId),
					eq(topicImageRenders.kind, "regenerate"),
					gte(topicImageRenders.createdAt, since),
				),
			),
	])
	const used = usedRow?.used ?? 0
	const limit = userAccess.isAdmin ? ADMIN_QUOTA : PLANS[userAccess.plan].imageRegenerationLimit
	return { used, limit, remaining: Math.max(0, limit - used) }
}

/**
 * Returns the user's Topic Post Discussion regenerations this UTC month against their plan's limit, which is separate
 * from the image limit. An admin has the admin quota.
 */
export async function loadDiscussionRegenerationQuota(userId: string): Promise<ImageRegenerationQuota> {
	// count the user's regenerate rows since the month began, beside the plan that limits them
	const since = startOfUtcMonth(new Date())
	const [userAccess, [usedRow]] = await Promise.all([
		loadUserAccess(userId),
		db
			.select({ used: count() })
			.from(topicPostDiscussions)
			.where(
				and(
					eq(topicPostDiscussions.userId, userId),
					eq(topicPostDiscussions.kind, "regenerate"),
					gte(topicPostDiscussions.createdAt, since),
				),
			),
	])
	const used = usedRow?.used ?? 0
	const limit = userAccess.isAdmin ? ADMIN_QUOTA : PLANS[userAccess.plan].discussionRegenerationLimit
	return { used, limit, remaining: Math.max(0, limit - used) }
}

/**
 * Returns this month's recorded spend for the user, split into scans, chat, and podcast episodes, read at most once per
 * request. A write in the request clears the memo, so a read after a spend row is written sums again.
 */
export function monthlySpendDollars(userId: string): Promise<RecordedSpend> {
	// sum since the start of the UTC month, which the budget resets on, once per request for the user and the month
	const since = startOfUtcMonth(new Date())
	return memoizeInRequest(`monthly-spend:${userId}:${since.toISOString()}`, () => loadSpendSince({ since, userId }))
}

/**
 * Returns the spend recorded since a time for one user or for every user, split into scans, chat, and podcast episodes.
 */
export async function loadSpendSince({ since, userId }: LoadSpendSinceOptions): Promise<RecordedSpend> {
	// sum each table's cost since the start time, for the one user if one is given, even an empty user id
	const [
		[scanSpendRow],
		[chatSpendRow],
		[podcastEpisodeSpendRow],
		[personalSourcesSpendRow],
		[topicImageSpendRow],
		[topicPostDiscussionSpendRow],
		[topicPodcastEpisodeVideoSpendRow],
	] = await Promise.all([
		db
			.select({ dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.where(and(userId !== undefined ? eq(scans.ownerId, userId) : undefined, gte(scans.startedAt, since))),
		db
			.select({ dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			.where(and(userId !== undefined ? eq(chatTurns.userId, userId) : undefined, gte(chatTurns.createdAt, since))),
		db
			.select({ dollars: sql<string>`coalesce(sum(${podcastEpisodes.cost}), 0)` })
			.from(podcastEpisodes)
			.where(
				and(
					userId !== undefined ? eq(podcastEpisodes.ownerId, userId) : undefined,
					gte(podcastEpisodes.createdAt, since),
				),
			),
		db
			.select({ dollars: sql<string>`coalesce(sum(${personalSourcesSummarySpends.cost}), 0)` })
			.from(personalSourcesSummarySpends)
			.where(
				and(
					userId !== undefined ? eq(personalSourcesSummarySpends.userId, userId) : undefined,
					gte(personalSourcesSummarySpends.createdAt, since),
				),
			),
		// the topic image renders bill the user that asked for them
		db
			.select({ dollars: sql<string>`coalesce(sum(${topicImageRenders.cost}), 0)` })
			.from(topicImageRenders)
			.where(
				and(
					userId !== undefined ? eq(topicImageRenders.userId, userId) : undefined,
					gte(topicImageRenders.createdAt, since),
				),
			),
		// the Topic Post Discussions bill the user that started them
		db
			.select({ dollars: sql<string>`coalesce(sum(${topicPostDiscussions.cost}), 0)` })
			.from(topicPostDiscussions)
			.where(
				and(
					userId !== undefined ? eq(topicPostDiscussions.userId, userId) : undefined,
					gte(topicPostDiscussions.createdAt, since),
				),
			),
		// the films bill their podcast episode's owner.
		// ponytail: a rebuild's cost counts in the month the film was made, a cost row per render if that drifts
		db
			.select({ dollars: sql<string>`coalesce(sum(${topicPodcastEpisodeVideos.cost}), 0)` })
			.from(topicPodcastEpisodeVideos)
			.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
			.where(
				and(
					userId !== undefined ? eq(podcastEpisodes.ownerId, userId) : undefined,
					gte(topicPodcastEpisodeVideos.createdAt, since),
				),
			),
	])

	// a discussion is the two hosts recorded, and a film is its podcast episode's, so both count as podcast episode
	// spend
	const podcastEpisodeDollars =
		Number(podcastEpisodeSpendRow?.dollars ?? 0) +
		Number(topicPostDiscussionSpendRow?.dollars ?? 0) +
		Number(topicPodcastEpisodeVideoSpendRow?.dollars ?? 0)
	return {
		scanDollars: Number(scanSpendRow?.dollars ?? 0),
		chatDollars: Number(chatSpendRow?.dollars ?? 0),
		podcastEpisodeDollars,
		personalSourcesDollars: Number(personalSourcesSpendRow?.dollars ?? 0),
		topicImageDollars: Number(topicImageSpendRow?.dollars ?? 0),
	}
}

/**
 * Returns a recorded spend in cents, summed across scans, chat, and podcast episodes.
 */
export function toSpendCents({
	scanDollars,
	chatDollars,
	podcastEpisodeDollars,
	personalSourcesDollars,
	topicImageDollars,
}: RecordedSpend): number {
	// round each table's dollars to cents before adding, the way every budget comparison does
	return (
		toCentsFromDollars(scanDollars) +
		toCentsFromDollars(chatDollars) +
		toCentsFromDollars(podcastEpisodeDollars) +
		toCentsFromDollars(personalSourcesDollars) +
		toCentsFromDollars(topicImageDollars)
	)
}

/**
 * Whether a Topic's owner gets full Podcast Episodes, which an admin and a paid plan do.
 * The free plan gets short Podcast Episodes and keeps only the latest short one.
 */
export async function hasFullPodcastEpisodes(ownerId: string): Promise<boolean> {
	const ownerAccess = await loadUserAccess(ownerId)
	return ownerAccess.isAdmin || ownerAccess.plan !== "free"
}

// utc midnight starting from the given moment's day. quota days roll over at utc midnight
export function startOfUtcDay(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()))
}

/**
 * Returns a time's UTC day as its ISO date.
 */
export function toUtcDay(moment: Date): string {
	return moment.toISOString().slice(0, 10)
}

// utc midnight starting the given moment's month, when monthly spend and the key budget roll over
export function startOfUtcMonth(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), 1))
}

/**
 * The ids of the user's Topics that their plan runs on a daily frequency, oldest first. A user whose daily
 * Topics outgrew their limit by downgrading, or by having them before the limit existed, keeps the topics
 * they have held longest, and the rest fall out of the daily schedule. An admin keeps all their topics.
 */
export async function dailyTopicIdsWithinLimit(userId: string): Promise<Set<string>> {
	const dailyTopics = await loadDailyTopicsWithinLimit(userId)
	return new Set(dailyTopics.map((dailyTopic) => dailyTopic.id))
}

/**
 * Returns the user's daily and weekdays Topics within the plan's daily topic limit, oldest first, each with its
 * frequency.
 */
export async function loadDailyTopicsWithinLimit(
	userId: string,
): Promise<Pick<typeof topics.$inferSelect, "id" | "frequency">[]> {
	// every Topic that the user runs on a daily frequency, oldest first, so which topics are kept is stable between sweeps
	const [{ isAdmin, plan }, { billingInterval }, dailyTopicRows] = await Promise.all([
		loadUserAccess(userId),
		loadBillingAccess(userId),
		db
			.select({ id: topics.id, frequency: topics.frequency })
			.from(topics)
			.where(and(eq(topics.ownerId, userId), inArray(topics.frequency, [...dailyFrequencies])))
			.orderBy(topics.createdAt),
	])

	// admins bypass the daily topic limit
	const limit = isAdmin ? dailyTopicRows.length : PLANS[plan].dailyTopicLimit[billingInterval]
	return dailyTopicRows.slice(0, limit)
}
