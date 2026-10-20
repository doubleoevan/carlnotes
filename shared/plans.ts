// each billing plan's topic limit, daily topic limit, daily scan limit, monthly spend backstop, monthly budget
// cutoffs, and price
import type { billingIntervals, plans } from "./enums"

export type Plan = (typeof plans)[number]
export type BillingInterval = (typeof billingIntervals)[number]

// a limit that differs by how the subscription bills. reading one means naming a billing interval
type BillingIntervalLimit = Record<BillingInterval, number>

// the kinds of spend that stop at a monthly budget cutoff. full podcast episodes turn short and daily scans turn weekly
export const monthlyBudgetCutoffKinds = [
	"spokenQuestions",
	"fullPodcastEpisodes",
	"podcastEpisodes",
	"dailyScans",
	"manualScans",
] as const
export type MonthlyBudgetCutoffKind = (typeof monthlyBudgetCutoffKinds)[number]

// one cutoff: the kind of spend that stops, and the share of the monthly budget it stops at
export type MonthlyBudgetCutoff = { kind: MonthlyBudgetCutoffKind; budgetShare: number }

// a plan's fixed cutoff shares
type MonthlyBudgetCutoffShares = Record<Exclude<MonthlyBudgetCutoffKind, "dailyScans">, number | null>

type PlanConfig = {
	// a higher rank inherits every capability of the plans below it. free is 0, premium is highest
	rank: number
	topicLimit: number
	// how many members one of their leader teams may hold, null for unlimited. the best plan among a team's leaders wins
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
	// the share of the monthly budget at which each kind of spend stops, or null where the plan never has that kind of
	// spend. the daily scans cutoff moves with the month, so the plan sets no share for it
	monthlyBudgetCutoffShares: MonthlyBudgetCutoffShares
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
const MONTHLY_PRICE_CENTS = { free: 0, plus: 2000, premium: 4000 } as const satisfies Record<Plan, number>

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
		monthlyBudgetCutoffShares: {
			spokenQuestions: 0.15,
			fullPodcastEpisodes: null,
			podcastEpisodes: 0.2,
			manualScans: 0.9,
		},
		priceMonthlyCents: MONTHLY_PRICE_CENTS.free,
		priceYearlyCents: MONTHLY_PRICE_CENTS.free * YEARLY_MONTHS,
	},
	// $20 a month, $200 a year
	plus: {
		rank: 1,
		topicLimit: 10,
		teamMemberLimit: null,
		linkInviteMaxUses: 100,
		inviteLimit: 30,
		dailyTopicLimit: { monthly: 3, yearly: 4 },
		dailyScanLimit: { monthly: 15, yearly: 20 },
		monthlyBudgetCents: 1500,
		monthlyBudgetCutoffShares: {
			spokenQuestions: 0.4,
			fullPodcastEpisodes: 0.6,
			podcastEpisodes: 0.75,
			manualScans: 0.9,
		},
		priceMonthlyCents: MONTHLY_PRICE_CENTS.plus,
		priceYearlyCents: MONTHLY_PRICE_CENTS.plus * YEARLY_MONTHS,
	},
	// $40 a month, $400 a year
	premium: {
		rank: 2,
		topicLimit: 25,
		teamMemberLimit: null,
		linkInviteMaxUses: 250,
		inviteLimit: 50,
		dailyTopicLimit: { monthly: 6, yearly: 7 },
		dailyScanLimit: { monthly: 30, yearly: 40 },
		monthlyBudgetCents: 3500,
		monthlyBudgetCutoffShares: {
			spokenQuestions: 0.5,
			fullPodcastEpisodes: 0.7,
			podcastEpisodes: 0.85,
			manualScans: 0.9,
		},
		priceMonthlyCents: MONTHLY_PRICE_CENTS.premium,
		priceYearlyCents: MONTHLY_PRICE_CENTS.premium * YEARLY_MONTHS,
	},
} as const satisfies Record<Plan, PlanConfig>

// a user's authority and entitlement inputs, read together
export type UserAccess = { isAdmin: boolean; plan: Plan; budgetOverrideCents: number | null }

/**
 * The user's monthly budget in cents: their override, otherwise the admin backstop, otherwise the plan's.
 */
export function userBudgetCents({ isAdmin, plan, budgetOverrideCents }: UserAccess): number {
	// an override is deliberate, so it wins even for an admin. that is the only way to guarantee a limit
	return budgetOverrideCents ?? (isAdmin ? ADMIN_BUDGET_CENTS : PLANS[plan].monthlyBudgetCents)
}

/**
 * Returns a dollar amount in whole cents, rounded the same way for every spend sum and budget comparison.
 */
export function toCentsFromDollars(dollars: number): number {
	return Math.round(dollars * 100)
}

/**
 * Returns the user's monthly budget cutoffs, lowest share first, with the daily scans cutoff where the rest of the
 * budget only covers the daily scans left this month. An admin with no budget override has no cutoffs.
 */
export function toMonthlyBudgetCutoffs({
	userAccess,
	dailyScanCentsLeft,
}: {
	userAccess: UserAccess
	dailyScanCentsLeft: number
}): MonthlyBudgetCutoff[] {
	// an admin with no override spends against the admin backstop alone, and a user with no budget has no cutoffs
	const budgetCents = userBudgetCents(userAccess)
	if ((userAccess.isAdmin && userAccess.budgetOverrideCents === null) || budgetCents <= 0) {
		return []
	}

	// the daily scans cutoff, which a user with no daily scans left this month does not have
	const dailyScansBudgetShare = dailyScanCentsLeft > 0 ? Math.max(0, 1 - dailyScanCentsLeft / budgetCents) : null

	// every cutoff the plan has, lowest share first
	const budgetShares = { ...PLANS[userAccess.plan].monthlyBudgetCutoffShares, dailyScans: dailyScansBudgetShare }
	return monthlyBudgetCutoffKinds
		.flatMap((kind) => {
			const budgetShare = budgetShares[kind]
			return budgetShare === null ? [] : [{ kind, budgetShare }]
		})
		.sort((cutoff, otherCutoff) => cutoff.budgetShare - otherCutoff.budgetShare)
}

/**
 * Returns the mean of recent scan costs in cents, unrounded, or null if there are no recent scan costs.
 */
export function toMeanScanCents(recentScanCostDollars: number[]): number | null {
	// no recent scan costs have no mean
	if (recentScanCostDollars.length === 0) {
		return null
	}
	return (recentScanCostDollars.reduce((sum, dollars) => sum + dollars, 0) / recentScanCostDollars.length) * 100
}
