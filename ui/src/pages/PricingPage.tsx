import { plans } from "@shared/enums"
import { type BillingInterval, PLANS, type Plan, SCAN_COST_CENTS } from "@shared/plans"
import { Check } from "lucide-react"
import { useEffect, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { authClient } from "@/lib/authClient"
import { fetchBillingState, openBillingPortal, startCheckout } from "@/lib/billingClient"
import { isUsersPlan, toPlanBadge } from "@/lib/planCards"
import { cn, toBrewsWord } from "@/lib/utils"

// the recommended plan that a signed-out visitor sees highlighted
const RECOMMENDED_PLAN: Plan = "plus"

// the one-line pitch under each plan's name
const PLAN_TAGLINES: Record<Plan, string> = {
	free: "Carl reads a little.",
	plus: "Carl reads plenty.",
	premium: "Carl reads everything. Twice.",
}

// whole dollars stay whole, and a fractional effective-monthly price keeps its cents
function toWholeDollarLabel(cents: number): string {
	const dollars = cents / 100
	return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

// the plan's monthly budget stated in Brews, rounded up to ten so it reads as the estimate it is.
// how many Brews a month depends on how the user schedules their topics
function toMonthlyScanEstimate(monthlyBudgetCents: number): number {
	return Math.ceil(monthlyBudgetCents / SCAN_COST_CENTS / 10) * 10
}

/**
 * The pricing page: the three plans side by side with a monthly/yearly toggle, which opens at the
 * subscriber's own billing interval. Signed in, the user's own plan is highlighted. Signed out, the
 * recommended plan is.
 */
export function PricingPage() {
	const { data: session } = authClient.useSession()
	const [isYearly, setIsYearly] = useState(false)
	const [billingInterval, setBillingInterval] = useState<BillingInterval | null>(null)
	const [isRedirecting, setIsRedirecting] = useState(false)

	// the signed-in user's plan gets highlighted. the recommended plan gets highlighted for a logged-out visitor
	const signedInPlan = session ? ((session.user.plan ?? "free") as Plan) : null
	const highlightedPlan = signedInPlan ?? RECOMMENDED_PLAN

	// only a paid plan can bill on something other than monthly
	const isSubscribed = signedInPlan !== null && signedInPlan !== "free"
	const isLoadingInterval = isSubscribed && billingInterval === null

	// the yearly toggle is set to the interval the user bills on
	useEffect(() => {
		if (!isSubscribed) {
			return
		}
		fetchBillingState().then((billing) => {
			setBillingInterval(billing.billingInterval)
			setIsYearly(billing.billingInterval === "yearly")
		})
	}, [isSubscribed])

	// a free user upgrades through checkout at the selected billing interval
	async function handleCheckout(plan: Plan): Promise<void> {
		if (plan === "free") {
			return
		}
		setIsRedirecting(true)
		try {
			await startCheckout(plan, isYearly ? "yearly" : "monthly")
		} catch {
			setIsRedirecting(false)
		}
	}

	// a paying user changes or cancels their plan through the Stripe portal
	async function handlePortal(): Promise<void> {
		setIsRedirecting(true)
		const isOpened = await openBillingPortal()
		if (!isOpened) {
			setIsRedirecting(false)
		}
	}

	return (
		<main className="mx-auto max-w-5xl px-safe py-10">
			{/* the heading and the billing interval toggle */}
			<div className="text-center">
				<h1 className="font-display text-3xl">Pricing</h1>
				<p className="text-muted-foreground mt-2">Carl turns caffeine into notes. Choose how much coffee to buy him.</p>
				{/* the toggle billing interval button is initialized with the signed-in user's plan */}
				{!isLoadingInterval && (
					<div className="mt-6 inline-flex items-center gap-2 text-sm">
						Monthly
						<Switch checked={isYearly} onCheckedChange={setIsYearly} aria-label="Bill yearly" />
						Yearly
						{/* the badge switches to yearly */}
						<button
							type="button"
							onClick={() => setIsYearly(true)}
							disabled={isYearly}
							className="bg-card border-card text-link rounded-full border px-2 py-0.5 text-xs font-semibold shadow-lift transition-transform hover:scale-105 disabled:cursor-default disabled:hover:scale-100"
						>
							2 months free
						</button>
					</div>
				)}
			</div>

			{/* the plan cards only show after the billing interval is loaded */}
			{isLoadingInterval ? (
				<CoffeeLoading />
			) : (
				<div className="mt-8 grid gap-6 sm:grid-cols-3">
					{plans.map((plan) => (
						<PlanCard
							key={plan}
							plan={plan}
							isYearly={isYearly}
							isHighlighted={plan === highlightedPlan}
							signedInPlan={signedInPlan}
							subscribedInterval={billingInterval}
							isRedirecting={isRedirecting}
							onCheckout={handleCheckout}
							onPortal={handlePortal}
						/>
					))}
				</div>
			)}
		</main>
	)
}

// one plan card: the name, the price for the plan and its limits at the selected billing interval
function PlanCard({
	plan,
	isYearly,
	isHighlighted,
	signedInPlan,
	subscribedInterval,
	isRedirecting,
	onCheckout,
	onPortal,
}: {
	plan: Plan
	isYearly: boolean
	isHighlighted: boolean
	signedInPlan: Plan | null
	subscribedInterval: BillingInterval | null
	isRedirecting: boolean
	onCheckout: (plan: Plan) => void
	onPortal: () => void
}) {
	const planConfig = PLANS[plan]
	// the plan's monthly price for the selected billing interval
	const monthlyCents = isYearly ? planConfig.priceYearlyCents / 12 : planConfig.priceMonthlyCents

	// the selected billing interval and if it raises the limits
	const billingInterval = isYearly ? "yearly" : "monthly"
	const { dailyTopicLimit, dailyScanLimit } = planConfig
	const isDailyTopicLimitRaised = isYearly && dailyTopicLimit.yearly > dailyTopicLimit.monthly
	const isDailyScanLimitRaised = isYearly && dailyScanLimit.yearly > dailyScanLimit.monthly

	// whether this card is what the user is already on, which decides both its badge and its action
	const isCurrentPlan = isUsersPlan(plan, signedInPlan, billingInterval, subscribedInterval)
	const planBadge = toPlanBadge(isCurrentPlan, signedInPlan, isHighlighted)

	// the plans limits based on the billing interval
	const dailyTopicLimitForInterval = dailyTopicLimit[billingInterval]
	const dailyScanLimitForInterval = dailyScanLimit[billingInterval]
	const monthlyScanEstimate = toMonthlyScanEstimate(planConfig.monthlyBudgetCents)
	return (
		<section
			className={cn(
				"bg-card relative flex flex-col rounded-xl border p-6 shadow-lift",
				isHighlighted && "border-primary ring-primary/40 ring-2",
			)}
		>
			{/* the plan badge rides the top edge of the highlighted card */}
			{planBadge && (
				<span className="bg-primary text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold whitespace-nowrap">
					{planBadge}
				</span>
			)}
			<h2 className="font-display text-lg capitalize">{plan}</h2>
			<p className="text-muted-foreground mt-1 text-sm">{PLAN_TAGLINES[plan]}</p>
			{/* the price and its billing note */}
			<div className="mt-4">
				<span className="text-3xl font-bold">{toWholeDollarLabel(monthlyCents)}</span>
				<span className="text-muted-foreground text-sm"> /month</span>
			</div>
			<p className="text-muted-foreground mt-1 text-xs">
				{plan === "free"
					? "Free forever"
					: isYearly
						? `Billed ${toWholeDollarLabel(planConfig.priceYearlyCents)} yearly`
						: "Billed monthly"}
			</p>
			{/* the quotas, straight from the plans catalog. each line answers the question the one above it raises */}
			<ul className="mt-4 flex-1 space-y-2 text-sm">
				<QuotaLink label={`${planConfig.topicLimit} topics`} />
				<QuotaLink
					label={`${dailyTopicLimitForInterval} daily ${toBrewsWord(dailyTopicLimitForInterval)}`}
					isRaised={isDailyTopicLimitRaised}
				/>
				<QuotaLink
					label={`${dailyScanLimitForInterval} craft ${toBrewsWord(dailyScanLimitForInterval)} a day`}
					isRaised={isDailyScanLimitRaised}
				/>
				<QuotaLink label={`About ${monthlyScanEstimate} ${toBrewsWord(monthlyScanEstimate)} a month`} />
			</ul>
			<PlanButton
				plan={plan}
				isCurrentPlan={isCurrentPlan}
				signedInPlan={signedInPlan}
				isRedirecting={isRedirecting}
				onCheckout={onCheckout}
				onPortal={onPortal}
			/>
		</section>
	)
}

// one checked quota line, labeled with the year interval if the quota is raised
function QuotaLink({ label, isRaised }: { label: string; isRaised?: boolean }) {
	return (
		<li className="flex items-start gap-2">
			<Check className="text-primary mt-0.5 size-4 shrink-0" />
			{/* the marker flows with the words instead of beside them, so a wrapped line keeps its shape */}
			<span>
				{label}
				{isRaised && (
					<span className="bg-card border-card text-link ml-1.5 inline-flex items-center rounded-full border px-1.5 align-middle text-xs font-semibold shadow-lift">
						with Yearly plan
					</span>
				)}
			</span>
		</li>
	)
}

// the card's action: signup for a visitor, checkout for a free user's upgrade, the portal for a paying user
function PlanButton({
	plan,
	isCurrentPlan,
	signedInPlan,
	isRedirecting,
	onCheckout,
	onPortal,
}: {
	plan: Plan
	isCurrentPlan: boolean
	signedInPlan: Plan | null
	isRedirecting: boolean
	onCheckout: (plan: Plan) => void
	onPortal: () => void
}) {
	// a visitor starts at signup whichever card they pick
	if (signedInPlan === null) {
		return (
			<AnchorLink href="/signup?cta=pricing" className={cn(buttonVariants({ variant: "default" }), "mt-6 w-full")}>
				Get started
			</AnchorLink>
		)
	}
	if (isCurrentPlan) {
		return (
			<Button variant="outline" disabled className="mt-6 w-full">
				Current plan
			</Button>
		)
	}
	// a paying user's plan changes go through the Stripe portal
	if (signedInPlan !== "free") {
		return (
			<Button variant="outline" onClick={onPortal} disabled={isRedirecting} className="mt-6 w-full">
				Manage billing
			</Button>
		)
	}
	return (
		<Button onClick={() => onCheckout(plan)} disabled={isRedirecting} className="mt-6 w-full">
			Upgrade
		</Button>
	)
}
