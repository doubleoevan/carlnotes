// an admin plan change: a plan granted without billing through the billing projection the providers' webhooks use,
// with a log row of who granted it, when, and why, and its end once its end date passes

import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { Plan } from "@carlnotes/contracts/plans"
import { db } from "@carlnotes/db"
import { adminPlanChanges, billingSubscriptions } from "@carlnotes/db/schema/billing"
import { users } from "@carlnotes/db/schema/users"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, lte } from "drizzle-orm"
import { applyBillingProjection } from "./billingProjection"

// the user, the admin granting the admin plan change, the plan, the admin's reason, and when the admin plan change
// ends, null for no end
export type ChangeUserPlanOptions = {
	userId: string
	adminUserId: string
	plan: Plan
	reason: string
	endsAt: Date | null
}

/**
 * Grants the user a plan without billing and logs the admin plan change. A paid plan writes an admin billing row that
 * ends at endsAt, and the free plan clears an admin plan change. A user that Stripe or a store bills keeps their plan,
 * and the admin plan change is rejected as billed.
 */
export async function changeUserPlan({
	userId,
	adminUserId,
	plan,
	reason,
	endsAt,
}: ChangeUserPlanOptions): Promise<"changed" | "missing" | "billed"> {
	// a made-up user id is missing
	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
	if (!user) {
		return "missing"
	}

	// a paid plan's admin billing row names the log row as its subscription and the end date as its period end. the free
	// plan clears the admin billing row
	const adminPlanChangeId = crypto.randomUUID()
	const planEndsAt = isPaidPlan(plan) ? endsAt : null
	const projection = isPaidPlan(plan)
		? {
				provider: "admin" as const,
				plan,
				status: "active",
				providerCustomerId: userId,
				providerSubscriptionId: adminPlanChangeId,
				currentPeriodEnd: planEndsAt,
				hasPaymentMethod: false,
				billingInterval: "monthly" as const,
			}
		: null

	// write the plan as a webhook would, with the admin plan change's log row in the same transaction. a provider's
	// billing row rejects the admin plan change, and nothing is written
	const isApplied = await applyBillingProjection({
		userId,
		providers: ["admin"],
		projection,
		writeWithProjection: async (transaction) => {
			await transaction
				.insert(adminPlanChanges)
				.values({ id: adminPlanChangeId, userId, adminUserId, plan, reason, endsAt: planEndsAt })
		},
		eventProperties: { entryPoint: "admin_plan_change" },
	})
	return isApplied ? "changed" : "billed"
}

/**
 * Ends every admin plan change whose end date has passed, returning each user to the free plan. A user who subscribed
 * meanwhile already left the admin plan change for that subscription, and an admin plan change an admin granted again
 * meanwhile stays. A failed end is reported and retried on the next sweep. Returns how many admin plan changes ended.
 */
export async function endExpiredAdminPlanChanges(now: Date = new Date()): Promise<number> {
	// the admin billing rows whose end date has passed
	const expiredAdminPlanChanges = await db
		.select({ userId: billingSubscriptions.userId, adminPlanChangeId: billingSubscriptions.providerSubscriptionId })
		.from(billingSubscriptions)
		.where(and(eq(billingSubscriptions.provider, "admin"), lte(billingSubscriptions.currentPeriodEnd, now)))

	// clear each admin billing row through the projection, so the plan, the sessions, and the key budget follow
	let endedCount = 0
	for (const { userId, adminPlanChangeId } of expiredAdminPlanChanges) {
		try {
			const isEnded = await applyBillingProjection({
				userId,
				providers: ["admin"],
				projection: null,
				clearedSubscriptionId: adminPlanChangeId,
				eventProperties: { entryPoint: "admin_plan_change_expiry" },
			})
			endedCount += isEnded ? 1 : 0
		} catch (error) {
			reportError(error, "billing", { userId, outcome: "admin plan change end failed" })
		}
	}
	return endedCount
}
