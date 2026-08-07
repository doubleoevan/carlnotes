// per-user scan-quota checks
import { dailyFrequencies } from "@shared/enums"
import { ADMIN_QUOTA, type BillingInterval, PLANS, type Plan } from "@shared/plans"
import { and, count, eq, gte, inArray, ne } from "drizzle-orm"
import { db } from "."
import { billingSubscriptions, scans, topics, users } from "./schema"

// this user's admin status and billing plan, read together since every quota check needs both
export async function loadUserAccess(userId: string): Promise<{ isAdmin: boolean; plan: Plan }> {
	// one row read of the two access fields, defaulting a missing user to a plain free viewer
	const [user] = await db.select({ role: users.role, plan: users.plan }).from(users).where(eq(users.id, userId))
	return { isAdmin: user?.role === "admin", plan: user?.plan ?? "free" }
}

// how many scans ran for the user since utc midnight, scheduled and manual combined.
// a scan carries its own owner, so deleting a topic can't remove the count its scans already used up
export async function scansToday(userId: string): Promise<number> {
	// count every non-failed scan inside the utc day. a failed scan gives its slot back
	const [scanCountRow] = await db
		.select({ count: count() })
		.from(scans)
		.where(and(eq(scans.ownerId, userId), ne(scans.status, "failed"), gte(scans.startedAt, startOfUtcDay(new Date()))))
	return scanCountRow?.count ?? 0
}

// remaining scans the user may still run today under their plan. admins are effectively unlimited
export async function scansRemainingToday(userId: string): Promise<number> {
	// admins bypass the quota, everyone else gets their plan's daily limit minus what already ran today
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// which of the plan's daily limits is determined by the monthly or yearly billing interval
	const [{ billingInterval }, scansUsedToday] = await Promise.all([loadBillingAccess(userId), scansToday(userId)])
	return Math.max(0, PLANS[plan].dailyScanLimit[billingInterval] - scansUsedToday)
}

// how the user's subscription is billed, and whether Stripe has a card for it. the billing interval determines which of the plan's
// limits apply, and only a monthly subscription includes the metered overage price a scan past the daily limit bills to.
// a user with no subscription is on the free plan, which is always monthly
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
