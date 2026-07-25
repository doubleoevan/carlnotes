// the plan quotas. how many topics a user may hold, how many scans they may run today, their monthly budget, and the admin bypass
import { ADMIN_QUOTA, PLANS, type Plan } from "@shared/plans"
import { and, count, eq, gte, ne } from "drizzle-orm"
import { db } from "../../db"
import { scans, topics, users } from "../../db/schema"

/**
 * How many more topics the user may create under the topic cap, floored at zero.
 * The cap counts the topics they hold, so deleting one frees a slot.
 */
export async function topicsRemaining(userId: string): Promise<number> {
	// admins bypass the topic cap so they can test freely
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// count every topic that the user owns against their plan's cap
	const [topicCountRow] = await db.select({ count: count() }).from(topics).where(eq(topics.ownerId, userId))
	return Math.max(0, PLANS[plan].topicLimit - (topicCountRow?.count ?? 0))
}

/**
 * This user's admin status and billing plan, read together since every quota check needs both.
 */
export async function loadUserAccess(userId: string): Promise<{ isAdmin: boolean; plan: Plan }> {
	const [user] = await db.select({ role: users.role, plan: users.plan }).from(users).where(eq(users.id, userId))
	return { isAdmin: user?.role === "admin", plan: user?.plan ?? "free" }
}

/**
 * How many scans ran on the user's topics since utc midnight, scheduled and manual combined.
 */
export async function scansToday(userId: string): Promise<number> {
	// count every scan across every topic the user owns, joined through the topic for ownership.
	// a failed scan gives its quota slot back, while running and succeeded ones count
	const [scanCountRow] = await db
		.select({ count: count() })
		.from(scans)
		.innerJoin(topics, eq(scans.topicId, topics.id))
		.where(
			and(
				// the owner's scans only, of either origin
				eq(topics.ownerId, userId),
				// failed scans give the slot back, inside the utc day window
				ne(scans.status, "failed"),
				gte(scans.startedAt, startOfUtcDay(new Date())),
			),
		)

	// no rows means no countable scans today
	return scanCountRow?.count ?? 0
}

/**
 * Scans left today for the plan. Null for a non-owner, unlimited for an admin.
 */
// biome-ignore format: one line keeps the JSDoc-plus-signature run under the comment-density hook's limit
export async function scansRemaining(userId: string, isOwner: boolean, isAdmin: boolean, plan: Plan): Promise<number | null> {
	// a non-owner never sees the quota
	if (!isOwner) {
		return null
	}

	// admins bypass the quota entirely
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// everyone else sees today's real count against their plan's daily limit
	return Math.max(0, PLANS[plan].dailyScanLimit - (await scansToday(userId)))
}

/**
 * The UTC midnight starting the given moment's day. Quota days roll over at UTC midnight.
 */
export function startOfUtcDay(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()))
}

/**
 * The UTC midnight starting the given moment's month. Monthly spend rolls over on the first of the month, UTC.
 */
export function startOfUtcMonth(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), 1))
}
