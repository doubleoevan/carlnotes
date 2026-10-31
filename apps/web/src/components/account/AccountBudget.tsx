import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import { type BillingProvider, PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import {
	type AccountBudgetElements,
	AccountBudget as SharedAccountBudget,
} from "@carlnotes/core/components/AccountBudget"
import { PLAN_MANAGEMENT_LABELS, toPlanManagement } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { cn } from "@carlnotes/nightshift/classNames"
import { Settings } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { openPlanManagement } from "@/lib/billingRedirects"
import { CARD_CLASS } from "@/lib/styleClasses"
import { SpendMeter } from "./SpendMeter"

/**
 * The budget section on the account page: the payment notice, the spend meter, the scan usage, and the plan card.
 */
export function AccountBudget({
	billing,
	activity,
	isReadOnly = false,
}: {
	billing: BillingState
	activity: ActivityResponse | null
	// an admin viewing another user's account does not see the payment notice
	isReadOnly?: boolean
}) {
	return (
		<SharedAccountBudget
			billing={billing}
			isReadOnly={isReadOnly}
			elements={ACCOUNT_BUDGET_ELEMENTS}
			spendMeter={activity ? <SpendMeter {...activity} /> : null}
		/>
	)
}

// keep the existing card and text styling around shared account content
const ACCOUNT_BUDGET_ELEMENTS: AccountBudgetElements = {
	Card: ({ children }) => <section className={cn(CARD_CLASS, "space-y-4")}>{children}</section>,
	Group: ({ children }) => <div>{children}</div>,
	Text: ({ children, className }) => <span className={className}>{children}</span>,
	Heading: ({ children }) => <h2 className="font-semibold">{children}</h2>,
	PaymentNotice,
}

// a failed-payment notice whose Update opens where the plan is billed: the portal, or the store's subscription page
function PaymentNotice({ provider }: { provider: BillingProvider | null }) {
	return (
		<div className="border-destructive bg-card rounded-md border p-3 text-sm">
			<p className="text-destructive font-semibold">Your last payment didn't go through.</p>
			<p className="text-muted-foreground">
				<Button className="mt-1 mr-2" onClick={() => void openPlanManagement(toPlanManagement("web", provider))}>
					Update
				</Button>
				your payment method to keep Carl brewing.
			</p>
		</div>
	)
}

// a subscribed user manages billing where the plan is billed, the portal or the store that sold it, and a free user
// selects a plan on the plans page. a store subscriber's button names the store
export function PlanButton({ billing }: { billing: BillingState }) {
	const [isRedirecting, setIsRedirecting] = useState(false)
	const planManagement = toPlanManagement("web", billing.provider)
	const managePlanLabel =
		planManagement === "portal" ? PURCHASE_COPY.managePlan : PLAN_MANAGEMENT_LABELS[planManagement]

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
					<Button onClick={handleManage} disabled={isRedirecting}>
						<Settings className="size-4" />
						{managePlanLabel}
					</Button>
				</TooltipTrigger>
				<TooltipContent>Manage your plan</TooltipContent>
			</Tooltip>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href={PLANS_PATH} className={cn(buttonVariants({ variant: "default" }))}>
					<Settings className="size-4" />
					{PURCHASE_COPY.upgrade}
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent>Manage your plan</TooltipContent>
		</Tooltip>
	)
}
