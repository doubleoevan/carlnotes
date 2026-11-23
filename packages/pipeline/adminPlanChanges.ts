// an admin plan change: a plan set without billing through the billing projection the providers' webhooks use, with a
// log row of who set it and when

import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { Plan } from "@carlnotes/contracts/plans"
import { db } from "@carlnotes/db"
import { adminPlanChanges } from "@carlnotes/db/schema/billing"
import { users } from "@carlnotes/db/schema/users"
import { eq } from "drizzle-orm"
import { applyBillingProjection } from "./billingProjection"

// the user, the admin setting the plan, and the plan
export type ChangeUserPlanOptions = { userId: string; adminUserId: string; plan: Plan }

/**
 * Sets the user's plan without billing and logs the admin plan change. A paid plan writes an admin billing row, and
 * the free plan clears one. A user that Stripe or a store bills keeps their plan, and the admin plan change is rejected
 * as billed.
 */
export async function changeUserPlan({
	userId,
	adminUserId,
	plan,
}: ChangeUserPlanOptions): Promise<"changed" | "missing" | "billed"> {
	// a made-up user id is missing
	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
	if (!user) {
		return "missing"
	}

	// a paid plan's admin billing row names the log row as its subscription. the free plan clears the admin billing row
	const adminPlanChangeId = crypto.randomUUID()
	const projection = isPaidPlan(plan)
		? {
				provider: "admin" as const,
				plan,
				status: "active",
				providerCustomerId: userId,
				providerSubscriptionId: adminPlanChangeId,
				currentPeriodEnd: null,
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
			await transaction.insert(adminPlanChanges).values({ id: adminPlanChangeId, userId, adminUserId, plan })
		},
		eventProperties: { entryPoint: "admin_plan_change" },
	})
	return isApplied ? "changed" : "billed"
}
