// the pricing cards' identity rules: which plan the user is on, and which badge displays on the pricing page cards
import type { BillingInterval, Plan } from "@shared/plans"

/**
 * Whether a pricing page plan card matches the plan and billing interval the user is on
 */
export function isUsersPlan(
	plan: Plan,
	signedInPlan: Plan | null,
	billingInterval: BillingInterval,
	subscribedInterval: BillingInterval | null,
): boolean {
	return plan === signedInPlan && (plan === "free" || billingInterval === subscribedInterval)
}

// the pricing page plan card's top-edge badge: the viewer's own subscription is the current plan,
// the recommended badge is for a visitor who has not yet signed in
export function toPlanBadge(isCurrentPlan: boolean, signedInPlan: Plan | null, isHighlighted: boolean): string | null {
	if (isCurrentPlan) {
		return "Current plan"
	}
	return signedInPlan === null && isHighlighted ? "Recommended" : null
}
