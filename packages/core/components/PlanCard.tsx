import { isPaidPlan } from "@carlnotes/contracts/enums"
import { type BillingInterval, PLANS, type Plan, PURCHASE_COPY, SCAN_COST_CENTS } from "@carlnotes/contracts/plans"
import type { ComponentType, ReactNode } from "react"
import { toBrewsWord } from "../lib/labels"
import { isUsersPlan, toPlanBadge } from "../lib/planCards"

type Container = ComponentType<{ children: ReactNode }>
export type PlanCardElements = {
	Card: ComponentType<{ children: ReactNode; isHighlighted: boolean }>
	Badge: Container
	Title: Container
	Tagline: Container
	Price: ComponentType<{ price: string; billingNote: string }>
	Quotas: Container
	Quota: ComponentType<{ label: string; isRaised?: boolean }>
	Action: ComponentType<{ label: string; isDisabled: boolean; isOutlined: boolean; onPress: () => void }>
}
export type PlanCardProps = {
	plan: Plan
	isYearly: boolean
	isHighlighted: boolean
	signedInPlan: Plan | null
	subscribedInterval: BillingInterval | null
	isRedirecting?: boolean
	// the purchase actions. an app that offers no purchase passes neither, and a signed-in user's other plans then show
	// no action
	onCheckout?: (plan: Plan) => void
	onPortal?: () => void
	onSignup?: () => void
}

// keep marketing copy beside the shared card instead of a second mobile price catalog
const PLAN_TAGLINES: Record<Plan, string> = {
	free: "Carl reads a little.",
	plus: "Carl reads plenty.",
	premium: "Carl reads everything. Twice.",
}

/**
 * Composes each plan's price, quotas, badge, and available action for both apps.
 */
export function PlanCard({
	plan,
	isYearly,
	isHighlighted,
	signedInPlan,
	subscribedInterval,
	isRedirecting = false,
	onCheckout,
	onPortal,
	onSignup,
	elements: { Card, Badge, Title, Tagline, Price, Quotas, Quota, Action },
}: PlanCardProps & { elements: PlanCardElements }) {
	// read every limit from the existing plan catalog
	const config = PLANS[plan]
	const interval = isYearly ? "yearly" : "monthly"
	const monthlyCents = isYearly ? config.priceYearlyCents / 12 : config.priceMonthlyCents
	const isCurrentPlan = isUsersPlan(plan, signedInPlan, interval, subscribedInterval)
	const badge = toPlanBadge(isCurrentPlan, signedInPlan, isHighlighted)
	const dailyTopicLimit = config.dailyTopicLimit[interval]
	const dailyScanLimit = config.dailyScanLimit[interval]
	const monthlyScanEstimate = Math.ceil(config.monthlyBudgetCents / SCAN_COST_CENTS / 10) * 10
	const billingNote = !isPaidPlan(plan)
		? "Free forever"
		: isYearly
			? `Billed ${toWholeDollarLabel(config.priceYearlyCents)} yearly`
			: "Billed monthly"
	const action = toPlanAction({
		isCurrentPlan,
		signedInPlan,
		onSignup,
		onPortal,
		onCheckout: onCheckout && (() => onCheckout(plan)),
	})
	return (
		<Card isHighlighted={isHighlighted}>
			{badge && <Badge>{badge}</Badge>}
			<Title>{plan}</Title>
			<Tagline>{PLAN_TAGLINES[plan]}</Tagline>
			<Price price={toWholeDollarLabel(monthlyCents)} billingNote={billingNote} />
			{/* the quota ordering and yearly markers are identical on both platforms */}
			<Quotas>
				<Quota label={`${config.topicLimit} topics`} />
				<Quota
					label={`${dailyTopicLimit} daily ${toBrewsWord(dailyTopicLimit)}`}
					isRaised={isYearly && config.dailyTopicLimit.yearly > config.dailyTopicLimit.monthly}
				/>
				<Quota
					label={`${dailyScanLimit} craft ${toBrewsWord(dailyScanLimit)} a day`}
					isRaised={isYearly && config.dailyScanLimit.yearly > config.dailyScanLimit.monthly}
				/>
				<Quota label={`${toWholeDollarLabel(config.monthlyBudgetCents)} coffee fund a month`} />
				<Quota label={`About ${monthlyScanEstimate} ${toBrewsWord(monthlyScanEstimate)} a month`} />
				<Quota label={isPaidPlan(plan) ? "Full podcasts for every brew" : "Short podcast for latest brew only"} />
			</Quotas>
			{action && <Action {...action} isDisabled={isCurrentPlan || isRedirecting} />}
		</Card>
	)
}

// the card's action: sign-up for a visitor, the current plan marked, and a purchase action where the app offers one
function toPlanAction({
	isCurrentPlan,
	signedInPlan,
	onSignup,
	onPortal,
	onCheckout,
}: {
	isCurrentPlan: boolean
	signedInPlan: Plan | null
	onSignup?: () => void
	onPortal?: () => void
	onCheckout?: () => void
}): { label: string; isOutlined: boolean; onPress: () => void } | null {
	if (!signedInPlan) {
		return { label: "Get started", isOutlined: false, onPress: () => onSignup?.() }
	}
	if (isCurrentPlan) {
		return { label: "Current plan", isOutlined: true, onPress: () => {} }
	}

	// a paying user manages billing, and a free user upgrades
	if (isPaidPlan(signedInPlan)) {
		return onPortal ? { label: PURCHASE_COPY.manageBilling, isOutlined: true, onPress: onPortal } : null
	}
	return onCheckout ? { label: PURCHASE_COPY.upgrade, isOutlined: false, onPress: onCheckout } : null
}

// whole dollars stay whole; a fractional effective monthly price keeps its cents
function toWholeDollarLabel(cents: number): string {
	const dollars = cents / 100
	return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}
