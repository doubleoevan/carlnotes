import { authClient } from "@carlnotes/client/authClient"
import { fetchBillingState, fetchCheckoutUrl } from "@carlnotes/client/billingClient"
import { isPaidPlan, plans } from "@carlnotes/contracts/enums"
import type { BillingInterval, BillingProvider, Plan } from "@carlnotes/contracts/plans"
import { PLANS_SUBTITLE, RECOMMENDED_PLAN } from "@carlnotes/core/lib/planCards"
import { UPGRADE_PROMPTS } from "@carlnotes/core/lib/spokenQuestionsPaused"
import { PLAN_MANAGEMENT_LABELS, toPurchaseOffers } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { useEffect, useState } from "react"
import { MonthlyBudgetCutoffTable } from "@/components/account/MonthlyBudgetCutoffTable"
import { PlanCard } from "@/components/account/PlanCard"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Switch } from "@/components/primitives/switch"
import { useCtaPromptToast } from "@/hooks/useCtaPromptToast"
import { usePageTitle } from "@/hooks/usePageTitle"
import { openPlanManagement } from "@/lib/billingRedirects"
import { PAGE_CLASS } from "@/lib/styleClasses"

// the one toast that names what a mic sent the user here to upgrade for
const UPGRADE_PROMPT_TOAST_ID = "upgrade-prompt"

/**
 * The plans page: the three plans side by side with a monthly/yearly toggle, which opens at the
 * subscriber's own billing interval. Signed in, the user's own plan is highlighted. Signed out, the
 * recommended plan is.
 */
export function PlansPage() {
	usePageTitle("Plans")
	// say what upgrading unlocks if a mic past the spoken questions cutoff sent the user here
	useCtaPromptToast(UPGRADE_PROMPTS, UPGRADE_PROMPT_TOAST_ID)
	const { data: session } = authClient().useSession()
	const [isYearly, setIsYearly] = useState(false)
	const [billingInterval, setBillingInterval] = useState<BillingInterval | null>(null)
	const [provider, setProvider] = useState<BillingProvider | null>(null)
	const [isRedirecting, setIsRedirecting] = useState(false)

	// the signed-in user's plan gets highlighted. the recommended plan gets highlighted for a logged-out visitor
	const signedInPlan = session ? ((session.user.plan ?? "free") as Plan) : null
	const highlightedPlan = signedInPlan ?? RECOMMENDED_PLAN

	// only a paid plan can bill on something other than monthly
	const isSubscribed = isPaidPlan(signedInPlan)
	const isLoadingInterval = isSubscribed && billingInterval === null

	// checkout sells to everyone but a store subscriber, whose plan is managed in the store that sold it
	const { canPurchase, planManagement } = toPurchaseOffers({
		platform: "web",
		storeOffering: null,
		plan: signedInPlan,
		provider,
	})

	// the yearly toggle is set to the interval the user bills on, and the provider says where the plan is managed
	useEffect(() => {
		if (!isSubscribed) {
			return
		}
		fetchBillingState()
			.then((billing) => {
				setBillingInterval(billing.billingInterval)
				setIsYearly(billing.billingInterval === "yearly")
				setProvider(billing.provider)
			})
			// a failed read settles on monthly. a null interval holds the page on its loading state
			.catch((error) => {
				console.error("billing state load failed", error)
				setBillingInterval("monthly")
			})
	}, [isSubscribed])

	// a free user upgrades through checkout at the selected billing interval
	async function handleCheckout(plan: Plan): Promise<void> {
		if (!isPaidPlan(plan)) {
			return
		}
		setIsRedirecting(true)
		try {
			window.location.href = await fetchCheckoutUrl(plan, isYearly ? "yearly" : "monthly")
		} catch {
			setIsRedirecting(false)
		}
	}

	// a paying user changes or cancels their plan through the Stripe portal, or on the store's page for a store plan
	async function handlePlanManagement(): Promise<void> {
		if (!planManagement) {
			return
		}
		setIsRedirecting(true)
		// stop the spinner if the portal never opens, whether it rejected or threw, and after a store's page opens in a
		// new tab
		try {
			if (!(await openPlanManagement(planManagement))) {
				setIsRedirecting(false)
			}
		} catch (error) {
			console.error("billing portal failed", error)
			setIsRedirecting(false)
		}
	}

	return (
		<main className={PAGE_CLASS}>
			{/* the heading and the billing interval toggle */}
			<div className="text-center">
				<h1 className="font-display text-3xl">Plans</h1>
				<p className="text-muted-foreground mt-2">{PLANS_SUBTITLE}</p>
				{/* the toggle starts at the interval the subscriber bills on */}
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
							className="bg-card border-card text-link rounded-full border px-2 py-0.5 text-xs font-semibold shadow-raised transition-transform hover:scale-105 disabled:cursor-default disabled:hover:scale-100"
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
					{plans.map((planOption) => (
						<PlanCard
							key={planOption}
							plan={planOption}
							isYearly={isYearly}
							isHighlighted={planOption === highlightedPlan}
							signedInPlan={signedInPlan}
							subscribedInterval={billingInterval}
							isRedirecting={isRedirecting}
							onCheckout={canPurchase ? handleCheckout : undefined}
							planManagementAction={
								planManagement
									? { label: PLAN_MANAGEMENT_LABELS[planManagement], onPress: handlePlanManagement }
									: undefined
							}
						/>
					))}
				</div>
			)}

			{/* what each plan pauses as the month's spend climbs, in its own row under the plan cards */}
			<MonthlyBudgetCutoffTable />
		</main>
	)
}
