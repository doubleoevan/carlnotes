import { plans } from "@shared/enums"
import { PLANS, type Plan } from "@shared/plans"
import { Check } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Switch } from "@/components/primitives/switch"
import { authClient } from "@/lib/authClient"
import { openBillingPortal, startCheckout } from "@/lib/billingClient"
import { cn } from "@/lib/utils"

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

/**
 * The pricing page: the three plans side by side with a monthly/yearly toggle. Signed in, the
 * user's own plan is highlighted. Signed out, the recommended plan is.
 */
export function PricingPage() {
	const { data: session } = authClient.useSession()
	const [isYearly, setIsYearly] = useState(false)
	const [isRedirecting, setIsRedirecting] = useState(false)

	// the signed-in user's plan takes the highlight, and a visitor sees the recommended plan carry it
	const signedInPlan = session ? ((session.user.plan ?? "free") as Plan) : null
	const highlightedPlan = signedInPlan ?? RECOMMENDED_PLAN

	// a free user upgrades through checkout at the selected interval (monthly or yearly)
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
			{/* the heading and the billing-interval toggle */}
			<div className="text-center">
				<h1 className="font-display text-3xl">Pricing</h1>
				<p className="text-muted-foreground mt-2">Carl turns caffeine into notes. Choose how much coffee to buy him.</p>
				<div className="mt-6 inline-flex items-center gap-2 text-sm">
					Monthly
					<Switch checked={isYearly} onCheckedChange={setIsYearly} aria-label="Bill yearly" />
					Yearly
					<span className="bg-primary/10 text-link rounded-full px-2 py-0.5 text-xs font-semibold">2 months free</span>
				</div>
			</div>

			{/* the plan cards */}
			<div className="mt-8 grid gap-6 sm:grid-cols-3">
				{plans.map((plan) => (
					<PlanCard
						key={plan}
						plan={plan}
						isYearly={isYearly}
						isHighlighted={plan === highlightedPlan}
						signedInPlan={signedInPlan}
						isRedirecting={isRedirecting}
						onCheckout={handleCheckout}
						onPortal={handlePortal}
					/>
				))}
			</div>
		</main>
	)
}

// one plan card: the name, the price at the active interval, the quota list, and the action
function PlanCard({
	plan,
	isYearly,
	isHighlighted,
	signedInPlan,
	isRedirecting,
	onCheckout,
	onPortal,
}: {
	plan: Plan
	isYearly: boolean
	isHighlighted: boolean
	signedInPlan: Plan | null
	isRedirecting: boolean
	onCheckout: (plan: Plan) => void
	onPortal: () => void
}) {
	const planConfig = PLANS[plan]
	// the big number is always per month: the yearly interval shows its effective monthly rate
	const monthlyCents = isYearly ? planConfig.priceYearlyCents / 12 : planConfig.priceMonthlyCents
	const planBadge = toPlanBadge(plan, signedInPlan, isHighlighted)
	return (
		<section
			className={cn(
				"bg-card relative flex flex-col rounded-xl border p-6 shadow-sm",
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
			{/* the quotas, straight from the plans catalog */}
			<ul className="mt-4 flex-1 space-y-2 text-sm">
				<QuotaLink label={`${planConfig.topicLimit} topics`} />
				<QuotaLink label={`${planConfig.dailyScanLimit} scans per day`} />
				<QuotaLink label={`${toWholeDollarLabel(planConfig.monthlyBudgetCents)} budget per month`} />
			</ul>
			<PlanAction
				plan={plan}
				signedInPlan={signedInPlan}
				isRedirecting={isRedirecting}
				onCheckout={onCheckout}
				onPortal={onPortal}
			/>
		</section>
	)
}

// the card's top-edge badge: the viewer's own plan always wins over the highlight, and an unhighlighted card gets none
function toPlanBadge(plan: Plan, signedInPlan: Plan | null, isHighlighted: boolean): string | null {
	if (plan === signedInPlan) {
		return "Current plan"
	}
	return isHighlighted ? "Recommended" : null
}

// one checked quota line
function QuotaLink({ label }: { label: string }) {
	return (
		<li className="flex items-center gap-2">
			<Check className="text-primary size-4 shrink-0" />
			{label}
		</li>
	)
}

// the card's action: signup for a visitor, checkout for a free user's upgrade, the portal for a paying user
function PlanAction({
	plan,
	signedInPlan,
	isRedirecting,
	onCheckout,
	onPortal,
}: {
	plan: Plan
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
	if (plan === signedInPlan) {
		return (
			<Button variant="outline" disabled className="mt-6 w-full">
				Current plan
			</Button>
		)
	}
	// a paying user's plan changes, up or down, go through the Stripe portal
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
