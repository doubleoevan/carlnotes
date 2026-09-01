// per-user scan-quota checks
import { dailyFrequencies } from "@shared/enums"
import { ADMIN_QUOTA, type BillingInterval, PLANS, type Plan } from "@shared/plans"
import { and, count, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm"
import { db } from "."
import { billingSubscriptions, invites, scans, teamMembers, topics, users } from "./schema"

// the invite-limit factors: a first-week account reaches a fifth of its base, a sender whose week-old
const YOUNG_ACCOUNT_DAYS = 7
const YOUNG_ACCOUNT_FACTOR = 1 / 5
const LOW_REPUTATION_SHARE = 1 / 5
const LOW_REPUTATION_FACTOR = 1 / 2
const CONNECTED_LIMIT_FACTOR = 2

// how old a user invitation must be before its outcome counts toward a sender's reputation
const REPUTATION_AGE_DAYS = 7

// how many teams a user may create in a day
const DAILY_TEAM_LIMIT = 20

// how many source-suggestion model calls a user may make in a day, so nobody drains the budget on suggestions
const DAILY_SUGGESTION_LIMIT = 300

// today's suggestion counts by user, cleared when the utc day rolls over
let dayStartTime = ""
const suggestionCountsByUserId = new Map<string, number>()

/**
 * Increment the suggestion count today. return false if none are left. Admins bypass the limit.
 */
export async function incrementDaySuggestionCount(userId: string): Promise<boolean> {
	// an admin is not limited, so their count is never incremented
	const { isAdmin } = await loadUserAccess(userId)
	if (isAdmin) {
		return true
	}

	// a new utc day drops every count
	const todayStartTime = startOfUtcDay(new Date()).toISOString()
	if (dayStartTime !== todayStartTime) {
		dayStartTime = todayStartTime
		suggestionCountsByUserId.clear()
	}

	// reject past the daily suggestion limit or increment the suggestion count today
	const suggestionCount = suggestionCountsByUserId.get(userId) ?? 0
	if (suggestionCount >= DAILY_SUGGESTION_LIMIT) {
		return false
	}
	suggestionCountsByUserId.set(userId, suggestionCount + 1)
	return true
}

// return the user's role and billing plan
export async function loadUserAccess(userId: string): Promise<{ isAdmin: boolean; plan: Plan }> {
	// one row read of the two access fields, defaulting a missing user to a plain free user
	const [user] = await db.select({ role: users.role, plan: users.plan }).from(users).where(eq(users.id, userId))
	return { isAdmin: user?.role === "admin", plan: user?.plan ?? "free" }
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
 * The daily invite limit based on reputation: the plan's base scaled down for a first-week account,
 * and again for a sender mostly declined or ignored, floored at one, doubled for a recipient who accepts.
 */
export function toInviteLimit(input: {
	plan: Plan
	accountAgeDays: number
	// the accepted share among week-old user invitations, null if there are none to measure
	acceptedShare: number | null
	isConnectedRecipient: boolean
}): number {
	// each factor scales the base, and the floor keeps a mistake recoverable
	const ageFactor = input.accountAgeDays < YOUNG_ACCOUNT_DAYS ? YOUNG_ACCOUNT_FACTOR : 1
	const reputationFactor =
		input.acceptedShare !== null && input.acceptedShare < LOW_REPUTATION_SHARE ? LOW_REPUTATION_FACTOR : 1
	const limit = Math.max(1, Math.floor(PLANS[input.plan].inviteLimit * ageFactor * reputationFactor))
	return input.isConnectedRecipient ? limit * CONNECTED_LIMIT_FACTOR : limit
}

// the sender's accepted invite ratio among user invitations at least a week old
async function acceptedInviteRatio(userId: string): Promise<number | null> {
	const measuredThrough = new Date(Date.now() - REPUTATION_AGE_DAYS * 24 * 60 * 60 * 1000)
	const [inviteRows] = await db
		.select({ measured: count(), accepted: count(sql`case when ${invites.usedCount} > 0 then 1 end`) })
		.from(invites)
		.where(
			and(
				eq(invites.invitedByUserId, userId),
				// only user invitations have an outcome someone chose
				or(isNotNull(invites.email), isNotNull(invites.invitedUserId)),
				lte(invites.invitedAt, measuredThrough),
			),
		)
	if (!inviteRows || inviteRows.measured === 0) {
		return null
	}
	return inviteRows.accepted / inviteRows.measured
}

/**
 * This user's computed invite limit for today. Admins bypass it.
 */
async function inviteLimitToday(userId: string, isConnectedRecipient = false): Promise<number> {
	// an admin has no limit
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// the account's age and its acceptance record feed the invite limit formula
	const [userRow] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId))
	const accountAgeDays = userRow ? (Date.now() - userRow.createdAt.getTime()) / (24 * 60 * 60 * 1000) : 0
	const acceptedShare = await acceptedInviteRatio(userId)
	return toInviteLimit({ plan, accountAgeDays, acceptedShare, isConnectedRecipient })
}

/**
 * Whether the user may create a certain number of invites today, against the computed limit.
 */
export async function canCreateInvitesToday(
	userId: string,
	createCount = 1,
	isConnectedRecipient = false,
): Promise<boolean> {
	// count the number of invites this user has created since utc midnight
	const [inviteCountRow] = await db
		.select({ count: count() })
		.from(invites)
		.where(
			and(
				eq(invites.invitedByUserId, userId),
				gte(invites.invitedAt, startOfUtcDay(new Date())),
				or(isNotNull(invites.email), isNull(invites.invitedUserId)),
			),
		)
	const inviteLimit = await inviteLimitToday(userId, isConnectedRecipient)
	return (inviteCountRow?.count ?? 0) + createCount <= inviteLimit
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

// how the user's subscription is billed, and whether they have a card on file to bill overages to
export async function loadBillingAccess(
	userId: string,
): Promise<{ hasPaymentMethod: boolean; billingInterval: BillingInterval }> {
	const [subscriptionRow] = await db
		.select({
			hasPaymentMethod: billingSubscriptions.hasPaymentMethod,
			billingInterval: billingSubscriptions.billingInterval,
		})
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	return {
		hasPaymentMethod: subscriptionRow?.hasPaymentMethod ?? false,
		billingInterval: subscriptionRow?.billingInterval ?? "monthly",
	}
}

// utc midnight starting from the given moment's day. quota days roll over at utc midnight
export function startOfUtcDay(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()))
}

/**
 * The ids of the user's Topics that their plan runs on a daily frequency, oldest first. A user whose daily
 * Topics outgrew their limit by downgrading, or by having them before the limit existed, keeps the topics
 * they have held longest, and the rest fall out of the daily schedule. An admin keeps all their topics.
 */
export async function dailyTopicIdsWithinLimit(userId: string): Promise<Set<string>> {
	// every Topic that the user runs on a daily frequency, oldest first, so which topics are kept is stable between sweeps
	const [{ isAdmin, plan }, { billingInterval }, dailyTopicRows] = await Promise.all([
		loadUserAccess(userId),
		loadBillingAccess(userId),
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(eq(topics.ownerId, userId), inArray(topics.frequency, [...dailyFrequencies])))
			.orderBy(topics.createdAt),
	])

	// admins bypass the daily topic limit
	const dailyTopicIds = dailyTopicRows.map((topicRow) => topicRow.id)
	const limit = isAdmin ? dailyTopicIds.length : PLANS[plan].dailyTopicLimit[billingInterval]
	return new Set(dailyTopicIds.slice(0, limit))
}
