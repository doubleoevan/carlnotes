// each billing plan's topic cap, daily scan cap, monthly spend backstop, and price. scheduled and manual scans share one daily scan pool
import type { plans } from "./enums"

export type Plan = (typeof plans)[number]
type PlanConfig = {
	// a higher rank inherits every capability of the plans below it. free is 0, premium is highest
	rank: number
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

// an admin's monthly spend backstop in cents. admins bypass the topic and scan caps,
// but it stays a real number, since this bills a real card and a runaway scan loop should still hit a wall
export const ADMIN_BUDGET_CENTS = 100_000

// yearly is a flat 10x monthly on every plan — two months free,
// computed here, so the discount can never drift out of sync if a monthly price changes later
const YEARLY_MONTHS = 10
const MONTHLY_PRICE_CENTS = { free: 0, plus: 1500, premium: 2900 } as const satisfies Record<Plan, number>

// `satisfies` checks every plan defines every field, while `as const` keeps the values readonly literals
export const PLANS = {
	// $0 — capped low since there's no revenue to offset the cost
	free: {
		rank: 0,
		topicLimit: 3,
		dailyScanLimit: 5,
		monthlyBudgetCents: 300,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.free,
		priceYearlyCents: MONTHLY_PRICE_CENTS.free * YEARLY_MONTHS,
	},
	// $15/mo, $150/yr
	plus: {
		rank: 1,
		topicLimit: 10,
		dailyScanLimit: 20,
		monthlyBudgetCents: 1000,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.plus,
		priceYearlyCents: MONTHLY_PRICE_CENTS.plus * YEARLY_MONTHS,
	},
	// $29/mo, $290/yr
	premium: {
		rank: 2,
		topicLimit: 25,
		dailyScanLimit: 50,
		monthlyBudgetCents: 2000,
		priceMonthlyCents: MONTHLY_PRICE_CENTS.premium,
		priceYearlyCents: MONTHLY_PRICE_CENTS.premium * YEARLY_MONTHS,
	},
} as const satisfies Record<Plan, PlanConfig>
