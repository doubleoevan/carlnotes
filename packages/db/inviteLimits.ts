// a user's daily invite limit: the plan's base scaled by the account's age and its accepted user invitations
import { ADMIN_QUOTA, PLANS, type Plan } from "@carlnotes/contracts/plans"
import { DAY_MS } from "@carlnotes/contracts/time"
import { and, count, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm"
import { db } from "./index"
import { loadUserAccess, startOfUtcDay } from "./quotas"
import { invites } from "./schema/invites"
import { users } from "./schema/users"

// the invite-limit factors: a first-week account reaches a fifth of its base, a sender with under a fifth of week-old
// user invitations accepted is halved, and a connected recipient doubles the limit
const YOUNG_ACCOUNT_DAYS = 7
const YOUNG_ACCOUNT_FACTOR = 1 / 5
const LOW_REPUTATION_SHARE = 1 / 5
const LOW_REPUTATION_FACTOR = 1 / 2
const CONNECTED_LIMIT_FACTOR = 2

// how old a user invitation must be before its outcome counts toward a sender's reputation
const REPUTATION_AGE_DAYS = 7

/**
 * Returns the daily invite limit based on reputation: the plan's base scaled down for a first-week account,
 * and again for a sender mostly declined or ignored, floored at one, doubled for a recipient who accepts.
 */
export function toInviteLimit(input: {
	plan: Plan
	accountAgeDays: number
	// the accepted share among week-old user invitations, null if there are none to measure
	acceptedShare: number | null
	isConnectedRecipient: boolean
}): number {
	// the account's weight scales the base, and the floor keeps a mistake recoverable
	const limit = Math.max(1, Math.floor(PLANS[input.plan].inviteLimit * toAccountSignalWeight(input)))
	return input.isConnectedRecipient ? limit * CONNECTED_LIMIT_FACTOR : limit
}

/**
 * Returns how much an account's signal counts, from 1 for an established account down to a tenth: a fifth in its
 * first week, and half for a sender whose week-old user invitations were mostly declined or ignored.
 */
export function toAccountSignalWeight(input: { accountAgeDays: number; acceptedShare: number | null }): number {
	const ageFactor = input.accountAgeDays < YOUNG_ACCOUNT_DAYS ? YOUNG_ACCOUNT_FACTOR : 1
	const reputationFactor =
		input.acceptedShare !== null && input.acceptedShare < LOW_REPUTATION_SHARE ? LOW_REPUTATION_FACTOR : 1
	return ageFactor * reputationFactor
}

/**
 * Returns each sender's accepted share among their user invitations at least a week old. A sender with none to
 * measure has no entry.
 */
export async function loadAcceptedInviteShares(userIds: string[]): Promise<Map<string, number>> {
	// count each sender's measured and accepted user invitations in one read
	const latestMeasuredInvitedAt = new Date(Date.now() - REPUTATION_AGE_DAYS * DAY_MS)
	const inviteRows = await db
		.select({
			userId: invites.invitedByUserId,
			measured: count(),
			accepted: count(sql`case when ${invites.usedCount} > 0 then 1 end`),
		})
		.from(invites)
		.where(
			and(
				inArray(invites.invitedByUserId, userIds),
				// only user invitations have an outcome someone chose
				or(isNotNull(invites.email), isNotNull(invites.invitedUserId)),
				lte(invites.invitedAt, latestMeasuredInvitedAt),
			),
		)
		.groupBy(invites.invitedByUserId)
	return new Map(
		inviteRows.flatMap((inviteRow) =>
			inviteRow.userId ? [[inviteRow.userId, inviteRow.accepted / inviteRow.measured] as const] : [],
		),
	)
}

/**
 * Returns this user's computed invite limit for today. Admins bypass it.
 */
async function inviteLimitToday(userId: string, isConnectedRecipient = false): Promise<number> {
	// an admin has no limit
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// read the user's account age and accepted invite share, then return the invite limit
	const [userRow] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId))
	const accountAgeDays = userRow ? (Date.now() - userRow.createdAt.getTime()) / DAY_MS : 0
	const acceptedShare = (await loadAcceptedInviteShares([userId])).get(userId) ?? null
	return toInviteLimit({ plan, accountAgeDays, acceptedShare, isConnectedRecipient })
}

/**
 * Returns whether the user may create a certain number of invites today, against the computed limit.
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
