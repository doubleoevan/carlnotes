// per-user scan-quota checks
import { ADMIN_QUOTA, PLANS, type Plan } from "@shared/plans"
import { and, count, eq, gte, ne } from "drizzle-orm"
import { db } from "."
import { scans, topics, users } from "./schema"

// this user's admin status and billing plan, read together since every quota check needs both
export async function loadUserAccess(userId: string): Promise<{ isAdmin: boolean; plan: Plan }> {
	// one row read of the two access fields, defaulting a missing user to a plain free viewer
	const [user] = await db.select({ role: users.role, plan: users.plan }).from(users).where(eq(users.id, userId))
	return { isAdmin: user?.role === "admin", plan: user?.plan ?? "free" }
}

// how many scans ran on the user's topics since utc midnight, scheduled and manual combined
export async function scansToday(userId: string): Promise<number> {
	// count every non-failed scan across the user's topics inside the utc day. a failed scan gives its slot back
	const [scanCountRow] = await db
		.select({ count: count() })
		.from(scans)
		.innerJoin(topics, eq(scans.topicId, topics.id))
		.where(and(eq(topics.ownerId, userId), ne(scans.status, "failed"), gte(scans.startedAt, startOfUtcDay(new Date()))))
	return scanCountRow?.count ?? 0
}

// remaining scans the user may still run today under their plan. admins are effectively unlimited
export async function scansRemainingToday(userId: string): Promise<number> {
	// admins bypass the quota, everyone else gets their plan's daily limit minus what already ran today
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}
	return Math.max(0, PLANS[plan].dailyScanLimit - (await scansToday(userId)))
}

// utc midnight starting from the given moment's day. quota days roll over at utc midnight
export function startOfUtcDay(moment: Date): Date {
	return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()))
}
