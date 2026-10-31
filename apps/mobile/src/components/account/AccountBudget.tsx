import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { type BillingProvider, PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { isStoreProvider } from "@carlnotes/contracts/storeBilling"
import {
	type AccountBudgetElements,
	AccountBudget as SharedAccountBudget,
} from "@carlnotes/core/components/AccountBudget"
import { PLAN_MANAGEMENT_LABELS } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { usePurchaseOffers } from "@carlnotes/core/stores/purchaseOffersStore"
import { router } from "expo-router"
import { Settings } from "lucide-react-native"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { openPlanManagement } from "@/storePurchases"
import { SpendMeter } from "./SpendMeter"

/**
 * Renders the web's shared account budget inside native Nightshift elements.
 */
export function AccountBudget({ billing, activity }: { billing: BillingState; activity: ActivityResponse | null }) {
	// the spend meter's plans link where the store sells the user a plan
	const { canPurchase } = usePurchaseOffers(billing)
	return (
		<SharedAccountBudget
			billing={billing}
			spendMeter={activity && <SpendMeter activity={activity} canPurchase={canPurchase} />}
			elements={ACCOUNT_BUDGET_ELEMENTS}
		/>
	)
}

/**
 * Renders Account's plan button. Upgrade opens Plans where the store sells the user a plan, and Manage plan opens the
 * store that bills the paid plan. A plan billed on the web is named in a line with no link.
 */
export function PlanButton({ billing }: { billing: BillingState }) {
	// a plan billed on the web is managed there, with no link from the app
	const { canPurchase, planManagement } = usePurchaseOffers(billing)
	if (planManagement === "web") {
		return <Text className="text-sm text-muted-foreground">{PLAN_MANAGEMENT_LABELS.web}</Text>
	}

	// a store plan is managed in its store, and a free plan upgrades only where the store sells
	const storeProvider = isStoreProvider(planManagement) ? planManagement : null
	if (!storeProvider && !canPurchase) {
		return null
	}
	const label = storeProvider ? PURCHASE_COPY.managePlan : PURCHASE_COPY.upgrade
	return (
		<Button
			accessibilityLabel={label}
			onPress={() => (storeProvider ? void openPlanManagement(storeProvider) : router.push(PLANS_PATH))}
		>
			<Icon as={Settings} className="size-4" />
			<Text>{label}</Text>
		</Button>
	)
}

// native layout replaces only the web's DOM elements
const ACCOUNT_BUDGET_ELEMENTS: AccountBudgetElements = {
	Card: ({ children }) => (
		<View className="gap-4 rounded-lg border border-separator bg-card p-4 shadow-raised">{children}</View>
	),
	Group: View,
	Text: Text,
	Heading: ({ children }) => (
		<Text accessibilityRole="header" className="font-semibold">
			{children}
		</Text>
	),
	PaymentNotice,
}

// a failed-payment notice whose Update opens the store that bills the plan. a plan billed on the web gets the line
// with no link
function PaymentNotice({ provider }: { provider: BillingProvider | null }) {
	return (
		<View className="gap-2 rounded-md border border-destructive bg-card p-3">
			<Text className="font-semibold text-destructive">{"Your last payment didn't go through."}</Text>
			{isStoreProvider(provider) ? (
				<View className="flex-row flex-wrap items-center gap-2">
					<Button
						size="sm"
						accessibilityLabel="Update your payment method"
						onPress={() => void openPlanManagement(provider)}
					>
						<Text>Update</Text>
					</Button>
					<Text className="text-sm text-muted-foreground">your payment method to keep Carl brewing.</Text>
				</View>
			) : (
				<Text className="text-sm text-muted-foreground">Update your payment method to keep Carl brewing.</Text>
			)}
		</View>
	)
}
