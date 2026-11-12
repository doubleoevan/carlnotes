import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { isStoreProvider } from "@carlnotes/contracts/storeBilling"
import { type AccountPlanElements, AccountPlan as SharedAccountPlan } from "@carlnotes/core/components/AccountPlan"
import { PLAN_MANAGEMENT_LABELS } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { usePurchaseOffers } from "@carlnotes/core/stores/purchaseOffersStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { router } from "expo-router"
import { Columns3Cog, Settings } from "lucide-react-native"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { HIGHLIGHTED_PAGE_BUTTON_CLASS } from "@/pageButtonClasses"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"
import { openPlanManagement } from "@/storePurchases"

/**
 * Renders the web's shared account plan at the right of the Account screen's header row, with the plan button.
 */
export function AccountPlan({ billing, isLoadFailed }: { billing: BillingState | undefined; isLoadFailed: boolean }) {
	return (
		<SharedAccountPlan
			billing={billing}
			isLoadFailed={isLoadFailed}
			planAction={billing && <PlanButton billing={billing} />}
			elements={ACCOUNT_PLAN_ELEMENTS}
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
			className={HIGHLIGHTED_PAGE_BUTTON_CLASS}
			accessibilityLabel={label}
			onPress={() => (storeProvider ? void openPlanManagement(storeProvider) : router.push(PLANS_PATH))}
		>
			<Icon as={storeProvider ? Settings : Columns3Cog} className="size-4" />
			<Text>{label}</Text>
		</Button>
	)
}

// native layout replaces only the web's DOM elements
const ACCOUNT_PLAN_ELEMENTS: AccountPlanElements = {
	PlanRow: ({ children }) => <View className="flex-row flex-wrap items-center gap-3">{children}</View>,
	Text: Text,
	PlanPlaceholder: () => <View className={cn(SKELETON_SHAPE_CLASS, "h-9 w-32 rounded-md")} />,
}
