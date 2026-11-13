import type { ActivityResponse } from "@carlnotes/contracts/activity"
import type { BillingProvider } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { isStoreProvider } from "@carlnotes/contracts/storeBilling"
import {
	type AccountBudgetElements,
	AccountBudget as SharedAccountBudget,
} from "@carlnotes/core/components/AccountBudget"
import { usePurchaseOffers } from "@carlnotes/core/stores/purchaseOffersStore"
import { View } from "react-native"
import { MeterRing } from "@/components/common/MeterRing"
import { Button } from "@/components/primitives/button"
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
			activity={activity}
			spendMeter={activity && <SpendMeter activity={activity} canPurchase={canPurchase} />}
			elements={ACCOUNT_BUDGET_ELEMENTS}
		/>
	)
}

// native layout replaces only the web's DOM elements
const ACCOUNT_BUDGET_ELEMENTS: AccountBudgetElements = {
	Card: ({ children }) => (
		<View className="gap-4 rounded-lg border border-separator bg-card p-4 shadow-raised">{children}</View>
	),
	Text: Text,
	Heading: ({ children }) => (
		<Text accessibilityRole="header" className="font-semibold">
			{children}
		</Text>
	),
	CardTop: ({ children }) => <View className="gap-3">{children}</View>,
	CardTopRow: ({ children }) => <View className="flex-row items-start gap-3">{children}</View>,
	CardTopStart: ({ children }) => <View className="flex-1">{children}</View>,
	CardTopEnd: ({ children }) => <View className="flex-1 items-end">{children}</View>,
	Meters: ({ children }) => <View className="flex-row flex-wrap justify-center gap-8">{children}</View>,
	Meter: ({ children }) => <View className="items-center gap-1.5">{children}</View>,
	MeterRing,
	CardLine: ({ children }) => <View className="flex-row flex-wrap">{children}</View>,
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
