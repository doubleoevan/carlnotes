// the plan quotas the api reads: topics remaining, scans remaining today, and the monthly budget window
import { ADMIN_QUOTA, PLANS } from "@shared/plans"
import { count, eq } from "drizzle-orm"
import { db } from "../../db"
import { loadUserAccess, scansRemainingToday } from "../../db/quotas"
import { topics } from "../../db/schema"

// the per-user scan-quota checks live in db/quotas, next to the tables they read
export { loadUserAccess, scansToday, startOfUtcDay } from "../../db/quotas"

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
 * Scans left today for the plan. Null for a non-owner, unlimited for an admin.
 */
export async function scansRemaining(userId: string, isOwner: boolean): Promise<number | null> {
	// a non-owner never sees the quota
	if (!isOwner) {
		return null
	}

	// scans left today under the plan, admins included
	return scansRemainingToday(userId)
}

/**
 * The UTC midnight starting the given moment's month. Monthly spend rolls over on the first of the month, UTC.
 */
export function startOfUtcMonth(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), 1))
}
