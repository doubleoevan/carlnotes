import { authClient } from "@carlnotes/client/authClient"
import { fetchBillingState } from "@carlnotes/client/billingClient"
import { isPaidPlan, plans } from "@carlnotes/contracts/enums"
import type { BillingInterval, Plan } from "@carlnotes/contracts/plans"
import { isStoreProvider, STORE_NAMES } from "@carlnotes/contracts/storeBilling"
import { MonthlyBudgetCutoffTable } from "@carlnotes/core/components/MonthlyBudgetCutoffTable"
import { PLANS_SUBTITLE, READ_ONLY_PLANS_SUBTITLE, RECOMMENDED_PLAN } from "@carlnotes/core/lib/planCards"
import { toCtaPrompt } from "@carlnotes/core/lib/signupPrompts"
import { UPGRADE_PROMPTS } from "@carlnotes/core/lib/spokenQuestionsPaused"
import {
	PLAN_MANAGEMENT_LABELS,
	type PurchaseOffers,
	type StoreOffering,
} from "@carlnotes/core/lib/storefrontPurchaseRules"
import { toBillingQueryKey, usePurchaseOffers, useStoreOffering } from "@carlnotes/core/stores/purchaseOffersStore"
import { useQuery } from "@tanstack/react-query"
import { useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { PlanCard } from "@/components/account/PlanCard"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { PageScreen } from "@/components/layout/PageScreen"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { TermsAgreementText } from "@/components/session/TermsAgreementText"
import { DATA_TABLE_ELEMENTS } from "@/components/table/DataTable"
import { TableCard } from "@/components/table/TableCard"
import { useStorePurchase } from "@/hooks/useStoreBilling"
import { openSessionScreen } from "@/sessionReturnPath"
import { loadStoreOffering, openPlanManagement, toStorePrice } from "@/storePurchases"

/**
 * Compares the plans with the shared cards at the store's prices. A visitor's action leads to sign-up, a free user
 * buys through the store, a store subscriber switches plans there, and a user's own plan is marked. The purchase
 * offers decide every action, so a storefront the store does not sell on shows the cards read-only.
 */
export default function PlansScreen() {
	// the billing state and the store's offering, which the cards wait for
	const { data: session } = authClient().useSession()
	const query = useQuery({
		queryKey: toBillingQueryKey(session?.user.id),
		enabled: Boolean(session),
		queryFn: () => fetchBillingState(),
	})
	const storeOfferingQuery = useQuery({
		queryKey: ["store-offering"],
		queryFn: () => loadStoreOffering(),
		retry: false,
	})
	const storeOffering = useStoreOffering()
	const purchaseOffers = usePurchaseOffers()

	// start at the account's billing interval and retain a deliberate comparison choice
	const [selectedInterval, setSelectedInterval] = useState<"monthly" | "yearly" | null>(null)
	const subscribedInterval = query.data?.billingInterval ?? null
	const interval = selectedInterval ?? subscribedInterval ?? "monthly"

	// the highlighted plan: the user's own, or the recommended plan for a visitor
	const signedInPlan = session ? ((session.user.plan ?? "free") as Plan) : null
	const highlightedPlan = signedInPlan ?? RECOMMENDED_PLAN

	// what upgrading unlocks, if a mic past the spoken questions cutoff sent the user here
	const { cta } = useLocalSearchParams<{ cta?: string }>()
	const ctaPrompt = toCtaPrompt(UPGRADE_PROMPTS, cta ?? null)

	// wait for the billing state and the store's offering. show the web's subtitle where the user can buy a plan, or
	// could after sign-up, and the comparison subtitle elsewhere
	const isLoading = (Boolean(session) && query.isPending) || storeOfferingQuery.isPending
	const isSelling = purchaseOffers.canPurchase || (!session && Boolean(storeOffering?.hasFullOffering))
	return (
		<PageScreen
			title="Plans"
			header={
				<Text accessibilityRole="header" className="text-center font-display text-3xl">
					Plans
				</Text>
			}
			contentClassName="mt-2 gap-6"
		>
			<Text className="text-center text-muted-foreground">{isSelling ? PLANS_SUBTITLE : READ_ONLY_PLANS_SUBTITLE}</Text>
			{ctaPrompt && <Text className="text-center font-semibold">{ctaPrompt}</Text>}
			{/* use the web's interval switch and yearly offer */}
			<View className="flex-row flex-wrap items-center justify-center gap-2">
				<Text className="text-sm">Monthly</Text>
				<PreferenceSwitch
					label="Bill yearly"
					isChecked={interval === "yearly"}
					onChange={(isYearly) => setSelectedInterval(isYearly ? "yearly" : "monthly")}
				/>
				<Text className="text-sm">Yearly</Text>
				<Button
					variant="secondary"
					size="sm"
					className="rounded-full"
					accessibilityLabel="2 months free with yearly"
					disabled={interval === "yearly"}
					onPress={() => setSelectedInterval("yearly")}
				>
					<Text className="text-xs text-link">2 months free</Text>
				</Button>
			</View>
			{isLoading ? (
				<CoffeeLoading />
			) : query.isError ? (
				<LoadFailedNotice
					message="Plans didn't load."
					retryLabel="Retry loading plans"
					onRetry={() => void query.refetch()}
				/>
			) : (
				<StorePlanCards
					interval={interval}
					highlightedPlan={highlightedPlan}
					signedInPlan={signedInPlan}
					subscribedInterval={subscribedInterval}
					purchaseOffers={purchaseOffers}
					storeOffering={storeOffering}
					isStoreOfferingFailed={storeOfferingQuery.isError}
					onRetryStoreOffering={() => void storeOfferingQuery.refetch()}
				/>
			)}
			<View className="gap-3">
				<Text accessibilityRole="header" className="font-display text-xl">
					Feature windows
				</Text>
				<Text className="text-sm text-muted-foreground">
					Features pause until the next month as Carl runs out of coffee.
				</Text>
				<TableCard>
					<MonthlyBudgetCutoffTable elements={DATA_TABLE_ELEMENTS} Text={CutoffText} />
				</TableCard>
			</View>
		</PageScreen>
	)
}

// the Plans screen's interval, the plan to highlight, the user's plan and billing interval, what the store sells, and
// whether reading it failed
type StorePlanCardsProps = {
	interval: BillingInterval
	highlightedPlan: Plan
	signedInPlan: Plan | null
	subscribedInterval: BillingInterval | null
	purchaseOffers: PurchaseOffers
	storeOffering: StoreOffering | null
	isStoreOfferingFailed: boolean
	onRetryStoreOffering: () => void
}

// the plan cards at the store's prices with the actions the purchase offers allow, the store's renewal terms, and a
// retry if the store's prices did not load
function StorePlanCards({
	interval,
	highlightedPlan,
	signedInPlan,
	subscribedInterval,
	purchaseOffers,
	storeOffering,
	isStoreOfferingFailed,
	onRetryStoreOffering,
}: StorePlanCardsProps) {
	const { isPurchasing, purchasePlan } = useStorePurchase()

	// a plan the other store bills is managed there, and the cards offer no purchase for it
	const { canPurchase, planManagement } = purchaseOffers
	const planManagementAction =
		!canPurchase && isStoreProvider(planManagement)
			? { label: PLAN_MANAGEMENT_LABELS[planManagement], onPress: () => void openPlanManagement(planManagement) }
			: undefined
	return (
		<>
			{/* a failed offering shows the catalog's prices with no purchase, and a retry */}
			{isStoreOfferingFailed && (
				<LoadFailedNotice
					message="Store prices didn't load."
					retryLabel="Retry loading store prices"
					onRetry={onRetryStoreOffering}
				/>
			)}
			{plans.map((plan) => (
				<PlanCard
					key={plan}
					plan={plan}
					isYearly={interval === "yearly"}
					isHighlighted={plan === highlightedPlan}
					signedInPlan={signedInPlan}
					subscribedInterval={subscribedInterval}
					isRedirecting={isPurchasing}
					storePrice={isPaidPlan(plan) ? toStorePrice(plan, interval) : undefined}
					onCheckout={canPurchase ? (cardPlan) => void purchasePlan(cardPlan, interval) : undefined}
					planManagementAction={planManagementAction}
					onSignup={() => openSessionScreen({ screen: "/sign-up", returnPath: "/plans" })}
				/>
			))}
			{/* a plan billed on the web is named with no link */}
			{planManagement === "web" && (
				<Text className="text-center text-xs text-muted-foreground">{PLAN_MANAGEMENT_LABELS.web}</Text>
			)}
			{/* the store's renewal terms and the linked Terms and Privacy Policy, beside the cards that sell its
			subscriptions */}
			{canPurchase && storeOffering && (
				<View>
					<Text className="text-center text-xs text-muted-foreground">
						{`Plans renew automatically until you cancel in ${STORE_NAMES[storeOffering.storeProvider]}.`}
					</Text>
					<TermsAgreementText />
				</View>
			)}
		</>
	)
}

// keep table text identity stable while the selected interval changes
function CutoffText({ children }: { children: React.ReactNode }) {
	return <Text className="text-sm text-muted-foreground">{children}</Text>
}
