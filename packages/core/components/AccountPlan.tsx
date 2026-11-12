// the account page's plan at the right of its header row: the current plan, its billing interval on a paid plan, and
// the plan button right after it
import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { BillingState } from "@carlnotes/contracts/profiles"
import type { ComponentType, ReactNode } from "react"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type AccountPlanElements = {
	// the plan line with the plan button right after it
	PlanRow: Container
	Text: Container
	// the placeholder at the plan button's height while the plan loads
	PlanPlaceholder: ComponentType
}

/**
 * Shows the current plan with its billing interval on a paid plan and the plan button right after it, or a placeholder
 * at the button's height while the plan loads. A plan that failed to load shows nothing.
 */
export function AccountPlan({
	billing,
	isLoadFailed,
	planAction,
	elements: { PlanRow, Text, PlanPlaceholder },
}: {
	billing: BillingState | undefined
	isLoadFailed: boolean
	planAction: ReactNode
	elements: AccountPlanElements
}) {
	if (!billing) {
		return isLoadFailed ? null : <PlanPlaceholder />
	}
	return (
		<PlanRow>
			<Text>
				<Text className="font-semibold">Plan </Text>
				<Text className="text-muted-foreground capitalize">{billing.plan}</Text>
				{isPaidPlan(billing.plan) && (
					<Text className="text-muted-foreground">{` · billed ${billing.billingInterval}`}</Text>
				)}
			</Text>
			{planAction}
		</PlanRow>
	)
}
