// each billing plan's topic cap, daily scan cap, monthly spend backstop, and price. scheduled and manual scans share one scan pool
import type { plans } from "./enums"

export type Plan = (typeof plans)[number]
type PlanConfig = {
	topicLimit: number
	dailyScanLimit: number
	// the monthly spend backstop in cents. a ceiling on our cost to serve the user, not the user's price
	monthlyBudgetCents: number
	priceMonthlyCents: number
	priceYearlyCents: number
}

// the "remaining" count an admin sees for a quota they bypass. the api reports it and the ui renders it as "Unlimited".
// well above any real plan's limits, so a genuine remaining count never reaches it
export const ADMIN_QUOTA = 999

// yearly is a flat 10x monthly on every plan — two months free,
// computed here, so the discount can never drift out of sync if a monthly price changes later
const YEARLY_MONTHS = 10
const MONTHLY_PRICE_CENTS = { free: 0, plus: 1500, premium: 2900 } as const satisfies Record<Plan, number>

// `satisfies` checks every plan defines every field, while `as const` keeps the values readonly literals
export const PLANS = {
	// $0 — capped low since there's no revenue to offset the cost
	free: {
		topicLimit: 3,
		dailyScanLimit: 5,
		monthlyBudgetCents: 300,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.free,
		priceYearlyCents: MONTHLY_PRICE_CENTS.free * YEARLY_MONTHS,
	},
	// $15/mo, $150/yr
	plus: {
		topicLimit: 10,
		dailyScanLimit: 20,
		monthlyBudgetCents: 1000,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.plus,
		priceYearlyCents: MONTHLY_PRICE_CENTS.plus * YEARLY_MONTHS,
	},
	// $29/mo, $290/yr
	premium: {
		topicLimit: 25,
		dailyScanLimit: 50,
		monthlyBudgetCents: 2000,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.premium,
		priceYearlyCents: MONTHLY_PRICE_CENTS.premium * YEARLY_MONTHS,
	},
} as const satisfies Record<Plan, PlanConfig>
