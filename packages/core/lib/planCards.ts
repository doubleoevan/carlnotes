// the plan cards' rules: which plan the user is on, which badge displays on the plans page cards, the line under the
// plans page heading, and the monthly scan estimate
import { type BillingInterval, type Plan, SCAN_COST_CENTS } from "@carlnotes/contracts/plans"

// the recommended plan that a signed-out visitor sees highlighted
export const RECOMMENDED_PLAN: Plan = "plus"

// the line under the plans page heading where a plan can be bought, and where the cards only compare the plans
export const PLANS_SUBTITLE = "Carl turns caffeine into notes. Choose how much coffee to buy him."
export const READ_ONLY_PLANS_SUBTITLE = "Carl turns caffeine into notes. These are the plans and what each one pours."

/**
 * Whether a plans page plan card matches the plan and billing interval the user is on
 */
export function isUsersPlan(
	plan: Plan,
	signedInPlan: Plan | null,
	billingInterval: BillingInterval,
	subscribedInterval: BillingInterval | null,
): boolean {
	return plan === signedInPlan && (plan === "free" || billingInterval === subscribedInterval)
}

// the plans page plan card's top-edge badge
export function toPlanBadge(isCurrentPlan: boolean, signedInPlan: Plan | null, isHighlighted: boolean): string | null {
	if (isCurrentPlan) {
		return "Current plan"
	}
	return signedInPlan === null && isHighlighted ? "Recommended" : null
}

/**
 * Returns about how many scans a monthly budget buys, rounded up to the next ten.
 */
export function toMonthlyScanEstimate(monthlyBudgetCents: number): number {
	return Math.ceil(monthlyBudgetCents / SCAN_COST_CENTS / 10) * 10
}
