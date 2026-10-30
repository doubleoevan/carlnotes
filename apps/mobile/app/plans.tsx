import { authClient } from "@carlnotes/client/authClient"
import { fetchBillingState } from "@carlnotes/client/billingClient"
import { plans } from "@carlnotes/contracts/enums"
import type { Plan } from "@carlnotes/contracts/plans"
import { MonthlyBudgetCutoffTable } from "@carlnotes/core/components/MonthlyBudgetCutoffTable"
import { RECOMMENDED_PLAN } from "@carlnotes/core/lib/planCards"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { View } from "react-native"
import { PlanCard } from "@/components/account/PlanCard"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { PageScreen } from "@/components/layout/PageScreen"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { DATA_TABLE_ELEMENTS } from "@/components/table/DataTable"
import { TableCard } from "@/components/table/TableCard"
import { openSessionScreen } from "@/sessionReturnPath"

/**
 * Compares the plans with the shared cards, read-only. A visitor's action leads to sign-up, and a user sees their own
 * plan marked.
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
	const interval = selectedInterval ?? query.data?.billingInterval ?? "monthly"
	// the highlighted plan: the user's own, or the recommended plan for a visitor
	const signedInPlan = session ? ((session.user.plan ?? "free") as Plan) : null
	const highlightedPlan = signedInPlan ?? RECOMMENDED_PLAN
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
				Carl turns caffeine into notes. These are the plans and what each one pours.
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
			{session && query.isPending ? (
				<CoffeeLoading />
			) : query.isError ? (
				<LoadFailedNotice
					message="Plans didn't load."
					retryLabel="Retry loading plans"
					onRetry={() => void query.refetch()}
				/>
			) : (
				plans.map((plan) => (
					<PlanCard
						key={plan}
						plan={plan}
						isYearly={interval === "yearly"}
						isHighlighted={plan === highlightedPlan}
						signedInPlan={signedInPlan}
						subscribedInterval={query.data?.billingInterval ?? null}
						onSignup={() => openSessionScreen({ screen: "/sign-up", returnPath: "/plans" })}
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
