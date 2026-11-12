import { isPaidPlan } from "@carlnotes/contracts/enums"
import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { type AccountPlanElements, AccountPlan as SharedAccountPlan } from "@carlnotes/core/components/AccountPlan"
import { PLAN_MANAGEMENT_LABELS, toPlanManagement } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { cn } from "@carlnotes/nightshift/classNames"
import { Columns3Cog, Settings } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { openPlanManagement } from "@/lib/billingRedirects"
import { HIGHLIGHTED_PAGE_BUTTON_CLASS, SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"

/**
 * The account page's plan at the right of its header row, with the plan button, or the plan alone in an admin's
 * read-only view of another user's account.
 */
export function AccountPlan({
	billing,
	isLoadFailed,
	isReadOnly,
}: {
	billing: BillingState | undefined
	isLoadFailed: boolean
	isReadOnly: boolean
}) {
	return (
		<SharedAccountPlan
			billing={billing}
			isLoadFailed={isLoadFailed}
			planAction={billing && !isReadOnly ? <PlanButton billing={billing} /> : null}
			elements={ACCOUNT_PLAN_ELEMENTS}
		/>
	)
}

// the plan line, which wraps at the right of the header row on a phone, and the plan button's placeholder
const ACCOUNT_PLAN_ELEMENTS: AccountPlanElements = {
	PlanRow: ({ children }) => <div className="flex flex-wrap items-center justify-end gap-3">{children}</div>,
	Text: ({ children, className }) => <span className={className}>{children}</span>,
	PlanPlaceholder: () => <div className={cn(SKELETON_SHAPE_CLASS, "h-9 w-32 rounded-md")} />,
}

// a subscribed user manages the plan where it is billed, the portal or the store that sold it, and a free user
// selects a plan on the plans page. a store subscriber's button names the store
function PlanButton({ billing }: { billing: BillingState }) {
	const [isRedirecting, setIsRedirecting] = useState(false)
	const planManagement = toPlanManagement("web", billing.provider)

	// open the portal, which this tab leaves for, or the store's page in a new tab
	async function handleManage(): Promise<void> {
		setIsRedirecting(true)
		const isLeaving = await openPlanManagement(planManagement)
		if (!isLeaving) {
			setIsRedirecting(false)
		}
	}

	if (isPaidPlan(billing.plan)) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button className={HIGHLIGHTED_PAGE_BUTTON_CLASS} onClick={handleManage} disabled={isRedirecting}>
						<Settings className="size-4" />
						{PLAN_MANAGEMENT_LABELS[planManagement]}
					</Button>
				</TooltipTrigger>
				<TooltipContent>Manage your plan</TooltipContent>
			</Tooltip>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href={PLANS_PATH} className={HIGHLIGHTED_PAGE_BUTTON_CLASS}>
					<Columns3Cog className="size-4" />
					{PURCHASE_COPY.upgrade}
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent>Manage your plan</TooltipContent>
		</Tooltip>
	)
}
