import type { BillingState } from "@carlnotes/contracts/profiles"

// a free user's billing state with this month's image regenerations, shared by web and mobile component previews
export const ACCOUNT_BUDGET_STORY_BILLING: BillingState = {
	plan: "free",
	billingInterval: "monthly",
	status: null,
	hasPaymentMethod: false,
	dailyScansUsed: 0,
	dailyScanLimit: 1,
	provider: null,
	isOverageBillable: false,
	revenueCatAppUserId: null,
	imageRegenerationQuota: { used: 1, limit: 2 },
}
