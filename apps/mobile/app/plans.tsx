import { authClient } from "@carlnotes/client/authClient"
import { fetchBillingPortalUrl, fetchBillingState, fetchCheckoutUrl } from "@carlnotes/client/billingClient"
import { isPaidPlan, plans } from "@carlnotes/contracts/enums"
import type { Plan } from "@carlnotes/contracts/plans"
import { MonthlyBudgetCutoffTable } from "@carlnotes/core/components/MonthlyBudgetCutoffTable"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Alert, View } from "react-native"
import { PlanCard } from "@/components/account/PlanCard"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { openExternalLink } from "@/components/common/AnchorLink"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { PageScreen } from "@/components/layout/PageScreen"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { DATA_TABLE_ELEMENTS } from "@/components/table/DataTable"
import { TableCard } from "@/components/table/TableCard"

/**
 * Compares the existing plans with shared cards and native navigation to hosted billing.
 */
export default function PlansScreen() {
	// start at the account's billing interval and retain a deliberate comparison choice
	const { data: session } = authClient().useSession()
	const query = useQuery({
		queryKey: ["billing", session?.user.id],
		enabled: Boolean(session),
		queryFn: () => fetchBillingState(),
	})
	const [selectedInterval, setSelectedInterval] = useState<"monthly" | "yearly" | null>(null)
	const [isRedirecting, setIsRedirecting] = useState(false)
	const interval = selectedInterval ?? query.data?.billingInterval ?? "monthly"
	const signedInPlan = (session?.user.plan ?? "free") as Plan
	async function handleBilling(plan?: Plan): Promise<void> {
		if (isRedirecting) {
			return
		}
		setIsRedirecting(true)
		try {
			const url = plan && isPaidPlan(plan) ? await fetchCheckoutUrl(plan, interval) : await fetchBillingPortalUrl()
			if (url) {
				await openExternalLink(url)
			} else {
				Alert.alert("Plans", "The billing page didn't open. Try again.")
			}
			await query.refetch()
		} catch {
			Alert.alert("Plans", "The billing page didn't open. Try again.")
		} finally {
			setIsRedirecting(false)
		}
	}
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
			<Text className="text-center text-muted-foreground">
				Carl turns caffeine into notes. Choose how much coffee to buy him.
			</Text>
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
			{query.isPending ? (
				<CoffeeLoading />
			) : query.isError ? (
				<Button variant="outline" accessibilityLabel="Retry loading plans" onPress={() => void query.refetch()}>
					<Text>Retry loading plans</Text>
				</Button>
			) : (
				plans.map((plan) => (
					<PlanCard
						key={plan}
						plan={plan}
						isYearly={interval === "yearly"}
						isHighlighted={plan === signedInPlan}
						signedInPlan={signedInPlan}
						subscribedInterval={query.data.billingInterval}
						isRedirecting={isRedirecting}
						onCheckout={(plan) => void handleBilling(plan)}
						onPortal={() => void handleBilling()}
					/>
				))
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

// keep table text identity stable while the selected interval changes
function CutoffText({ children }: { children: React.ReactNode }) {
	return <Text className="text-sm text-muted-foreground">{children}</Text>
}
