import { isPaidPlan } from "@carlnotes/contracts/enums"
import { type BillingInterval, PLANS, type Plan, PURCHASE_COPY, userTopicLimit } from "@carlnotes/contracts/plans"
import { SHARED_COMMENT_SLOTS } from "@carlnotes/contracts/social"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { ComponentType, ReactNode } from "react"
import { toBrewsWord, toWholeDollarLabel } from "../lib/labels"
import { isUsersPlan, toMonthlyScanEstimate, toPlanBadge } from "../lib/planCards"

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

// a plan card's price per month and the line under it that says how it bills
export type PlanPrice = { price: string; billingNote: string }

// where a paid plan is managed: the action's label and what it opens
type PlanManagementAction = { label: string; onPress: () => void }

export type PlanCardProps = {
	plan: Plan
	isYearly: boolean
	isHighlighted: boolean
	freeTopicLimit?: number | null
	signedInPlan: Plan | null
	subscribedInterval: BillingInterval | null
	isRedirecting?: boolean
	// the store's price for this plan and interval, in place of the catalog's dollars
	storePrice?: PlanPrice
	// the purchase actions. an app that offers no purchase passes neither, and a signed-in user's other plans then show
	// no action. a paid user's checkout switches the plan, and the plan management action opens where the plan is managed
	onCheckout?: (plan: Plan) => void
	planManagementAction?: PlanManagementAction
	onSignup?: () => void
}

// keep marketing copy beside the shared card instead of a second mobile price catalog
const PLAN_TAGLINES: Record<Plan, string> = {
	free: "Carl reads a little.",
	plus: "Carl reads plenty.",
	premium: "Carl reads everything. Twice.",
}

// the podcast line, by whether the plan gets full podcast episodes
const PODCAST_QUOTA_LABELS = {
	full: "Full podcasts for every brew",
	short: "Short podcast for latest brew only",
} as const

// the comments line: how many comments a Topic's editors share with each podcast episode
function toSharedCommentSlotsQuotaLabel(isPaid: boolean): string {
	return `${isPaid ? SHARED_COMMENT_SLOTS.full : SHARED_COMMENT_SLOTS.short} hot takes per podcast episode`
}

/**
 * Composes each plan's price, quotas, badge, and available action for both apps.
 */
export function PlanCard({
	plan,
	isYearly,
	isHighlighted,
	signedInPlan,
	freeTopicLimit,
	subscribedInterval,
	isRedirecting = false,
	storePrice,
	onCheckout,
	planManagementAction,
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
	const monthlyScanEstimate = toMonthlyScanEstimate(config.monthlyBudgetCents)
	const billingNote = !isPaidPlan(plan)
		? "Free forever"
		: isYearly
			? `Billed ${toWholeDollarLabel(config.priceYearlyCents)} yearly`
			: "Billed monthly"
	const planPrice = storePrice ?? { price: toWholeDollarLabel(monthlyCents), billingNote }
	const action = toPlanAction({
		isCurrentPlan,
		signedInPlan,
		onSignup,
		planManagementAction,
		onCheckout: onCheckout && (() => onCheckout(plan)),
	})
	return (
		<Card isHighlighted={isHighlighted}>
			{badge && <Badge>{badge}</Badge>}
			<Title>{plan}</Title>
			<Tagline>{PLAN_TAGLINES[plan]}</Tagline>
			<Price {...planPrice} />
			{/* the quota ordering and yearly markers are identical on both platforms */}
			<Quotas>
				<Quota label={toCountLabel(userTopicLimit({ plan, freeTopicLimit: freeTopicLimit ?? undefined }), "topic")} />
				<Quota label="Send AI chats to Carl to read for your topics" />
				{config.canEmailCarl && <Quota label="Send emails to Carl to read for your topics" />}
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
				<Quota label={PODCAST_QUOTA_LABELS[isPaidPlan(plan) ? "full" : "short"]} />
				<Quota label={`${config.imageRegenerationLimit} image regenerations a month`} />
				<Quota label={toSharedCommentSlotsQuotaLabel(isPaidPlan(plan))} />
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
	planManagementAction,
	onCheckout,
}: {
	isCurrentPlan: boolean
	signedInPlan: Plan | null
	onSignup?: () => void
	planManagementAction?: PlanManagementAction
	onCheckout?: () => void
}): { label: string; isOutlined: boolean; onPress: () => void } | null {
	if (!signedInPlan) {
		return { label: "Get started", isOutlined: false, onPress: () => onSignup?.() }
	}
	if (isCurrentPlan) {
		return { label: "Current plan", isOutlined: true, onPress: () => {} }
	}

	// a paying user manages billing where the plan is billed or switches it in the store, and a free user upgrades
	if (isPaidPlan(signedInPlan)) {
		if (planManagementAction) {
			return { ...planManagementAction, isOutlined: true }
		}
		return onCheckout ? { label: PURCHASE_COPY.switchPlan, isOutlined: true, onPress: onCheckout } : null
	}
	return onCheckout ? { label: PURCHASE_COPY.upgrade, isOutlined: false, onPress: onCheckout } : null
}
