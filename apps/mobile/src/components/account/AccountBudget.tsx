import type { ActivityResponse } from "@carlnotes/contracts/activity"
import type { BillingState } from "@carlnotes/contracts/profiles"
import {
	type AccountBudgetElements,
	AccountBudget as SharedAccountBudget,
} from "@carlnotes/core/components/AccountBudget"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { SpendMeter } from "./SpendMeter"

/**
 * Renders the web's shared account budget inside native Nightshift elements.
 */
export function AccountBudget({ billing, activity }: { billing: BillingState; activity: ActivityResponse | null }) {
	return (
		<SharedAccountBudget
			billing={billing}
			spendMeter={activity && <SpendMeter activity={activity} />}
			elements={ACCOUNT_BUDGET_ELEMENTS}
		/>
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
	PaymentNotice: () => (
		<View className="gap-2 rounded-md border border-destructive bg-card p-3">
			<Text className="font-semibold text-destructive">{"Your last payment didn't go through."}</Text>
			<Text className="text-sm text-muted-foreground">Update your payment method to keep Carl brewing.</Text>
		</View>
	),
}
