// per-user limits, the user access row, the UTC day and month starts, and the podcast episode checks
import { dailyFrequencies, isAdminRole } from "@carlnotes/contracts/enums"
import {
	ADMIN_QUOTA,
	MAX_TOPIC_POST_BODY_IMAGE_BYTES,
	type OverageBillingAccess,
	PLANS,
	type UserAccess,
} from "@carlnotes/contracts/plans"
import { DAY_MS, toUtcDay } from "@carlnotes/contracts/time"
import { and, count, eq, gte, inArray, isNull, ne } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { countRateLimitHit } from "./redisRateLimits"
import { memoizeInRequest } from "./requestMemo"
import { billingSubscriptions } from "./schema/billing"
import { scans } from "./schema/scans"
import { teamMembers } from "./schema/teams"
import { topicImageRenders } from "./schema/topicImages"
import { topicPostDiscussions } from "./schema/topicPosts"
import { topics } from "./schema/topics"
import { users } from "./schema/users"

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

// how many images one Topic Post's body may hold and the most bytes one body image file may hold
export type TopicPostBodyImageLimits = { imageLimit: number; imageBytes: number }

/**
 * Returns the user's plan's body image limits. An admin has the admin quota of images at the largest plan's file size.
 */
export async function loadTopicPostBodyImageLimits(userId: string): Promise<TopicPostBodyImageLimits> {
	const userAccess = await loadUserAccess(userId)
	if (userAccess.isAdmin) {
		return { imageLimit: ADMIN_QUOTA, imageBytes: MAX_TOPIC_POST_BODY_IMAGE_BYTES }
	}
	const { topicPostBodyImageLimit, topicPostBodyImageBytes } = PLANS[userAccess.plan]
	return { imageLimit: topicPostBodyImageLimit, imageBytes: topicPostBodyImageBytes }
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
