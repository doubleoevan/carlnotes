// each billing plan's topic limit, daily topic limit, daily scan limit, monthly spend backstop, and price
import type { billingIntervals, plans } from "./enums"

export type Plan = (typeof plans)[number]
export type BillingInterval = (typeof billingIntervals)[number]

// a limit that differs by how the subscription bills. reading one means naming a billing interval
type BillingIntervalLimit = Record<BillingInterval, number>

type PlanConfig = {
	// a higher rank inherits every capability of the plans below it. free is 0, premium is highest
	rank: number
	topicLimit: number
	// how many members one of their led teams may hold, null for unlimited. the best plan among a team's leaders wins
	teamMemberLimit: number | null
	// how many people one of their invite links lets in before it is exhausted
	linkInviteMaxUses: number
	// the daily invite-limit base, scaled by account age and reputation before it applies
	inviteLimit: number
	// how many of those topics may run on a daily frequency, which is what actually decides the monthly spend
	dailyTopicLimit: BillingIntervalLimit
	dailyScanLimit: BillingIntervalLimit
	// the monthly spend backstop in cents. a limit on our cost to serve the user, not the user's price
	monthlyBudgetCents: number
	priceMonthlyCents: number
	priceYearlyCents: number
}

// the "remaining" count an admin sees for a quota they bypass
export const ADMIN_QUOTA = 999

// an admin's monthly spend backstop in cents
export const ADMIN_BUDGET_CENTS = 100_000

// what one scan costs on average, in cents
export const SCAN_COST_CENTS = 10

// yearly is a flat 10x monthly on every plan, two months free, computed here
const YEARLY_MONTHS = 10
const MONTHLY_PRICE_CENTS = { free: 0, plus: 1500, premium: 2900 } as const satisfies Record<Plan, number>

// the yearly billing interval has higher limits because it can't include metered overage.
export const PLANS = {
	// $0, has low limits to offset the cost
	free: {
		rank: 0,
		topicLimit: 3,
		teamMemberLimit: 15,
		linkInviteMaxUses: 25,
		inviteLimit: 30,
		dailyTopicLimit: { monthly: 1, yearly: 1 },
		dailyScanLimit: { monthly: 5, yearly: 5 },
		monthlyBudgetCents: 300,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.free,
		priceYearlyCents: MONTHLY_PRICE_CENTS.free * YEARLY_MONTHS,
	},
	// $15/mo, $150/yr
	plus: {
		rank: 1,
		topicLimit: 10,
		teamMemberLimit: null,
		linkInviteMaxUses: 100,
		inviteLimit: 30,
		dailyTopicLimit: { monthly: 3, yearly: 4 },
		dailyScanLimit: { monthly: 15, yearly: 20 },
		monthlyBudgetCents: 1000,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.plus,
		priceYearlyCents: MONTHLY_PRICE_CENTS.plus * YEARLY_MONTHS,
	},
	// $29/mo, $290/yr
	premium: {
		rank: 2,
		topicLimit: 25,
		teamMemberLimit: null,
		linkInviteMaxUses: 250,
		inviteLimit: 50,
		dailyTopicLimit: { monthly: 6, yearly: 7 },
		dailyScanLimit: { monthly: 30, yearly: 40 },
		monthlyBudgetCents: 2000,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.premium,
		priceYearlyCents: MONTHLY_PRICE_CENTS.premium * YEARLY_MONTHS,
	},
} as const satisfies Record<Plan, PlanConfig>
