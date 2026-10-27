import { fetchBillingPortalUrl } from "@carlnotes/client/billingClient"
import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { BillingState } from "@carlnotes/contracts/profiles"
import {
	type AccountBudgetElements,
	AccountBudget as SharedAccountBudget,
} from "@carlnotes/core/components/AccountBudget"
import { Settings } from "lucide-react-native"
import { useState } from "react"
import { Alert, View } from "react-native"
import { AnchorLink, openExternalLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
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

/**
 * Opens the existing hosted billing portal or the native plan comparison.
 */
export function PlanButton({ billing }: { billing: BillingState }) {
	if (!isPaidPlan(billing.plan)) {
		return (
			<AnchorLink href="/plans" accessibilityLabel="Upgrade" asChild>
				<Button accessibilityLabel="Upgrade">
					<Icon as={Settings} className="size-4 text-primary-foreground" />
					<Text>Upgrade</Text>
				</Button>
			</AnchorLink>
		)
	}
	return <ManagePlanButton />
}

// share the same portal action with the unpaid invoice notice
function ManagePlanButton() {
	const [isOpening, setIsOpening] = useState(false)
	async function handleOpen(): Promise<void> {
		setIsOpening(true)
		try {
			const url = await fetchBillingPortalUrl()
			if (url) {
				await openExternalLink(url)
			} else {
				Alert.alert("Manage plan", "The billing portal didn't open. Try again.")
			}
		} catch {
			Alert.alert("Manage plan", "The billing portal didn't open. Try again.")
		} finally {
			setIsOpening(false)
		}
	}

	return (
		<Button accessibilityLabel="Manage plan" disabled={isOpening} onPress={() => void handleOpen()}>
			<Icon as={Settings} className="size-4 text-primary-foreground" />
			<Text>Manage plan</Text>
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
	PaymentNotice: () => (
		<View className="gap-2 rounded-md border border-destructive bg-card p-3">
			<Text className="font-semibold text-destructive">{"Your last payment didn't go through."}</Text>
			<Text className="text-sm text-muted-foreground">Update your payment method to keep Carl brewing.</Text>
			<ManagePlanButton />
		</View>
	),
}
