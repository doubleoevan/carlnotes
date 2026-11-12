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
import { Columns3Cog, Settings } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { MeterRing } from "@/components/common/MeterRing"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { openPlanManagement } from "@/lib/billingRedirects"
import { CARD_CLASS, HIGHLIGHTED_PAGE_BUTTON_CLASS } from "@/lib/styleClasses"
import { SpendMeter } from "./SpendMeter"

/**
 * The budget section on the account page: the payment notice and the coffee fund and daily scans cards, each with the
 * plan and its button.
 */
export function AccountBudget({
	billing,
	activity,
	isReadOnly = false,
}: {
	billing: BillingState
	activity: ActivityResponse | null
	// an admin viewing another user's account does not see the payment notice, the plan button, or the upgrade link
	isReadOnly?: boolean
}) {
	return (
		<SharedAccountBudget
			billing={billing}
			isReadOnly={isReadOnly}
			elements={ACCOUNT_BUDGET_ELEMENTS}
			activity={activity}
			spendMeter={activity ? <SpendMeter {...activity} isReadOnly={isReadOnly} /> : null}
			planAction={isReadOnly ? null : <PlanButton billing={billing} />}
		/>
	)
}

// keep the existing card and text styling around shared account content
const ACCOUNT_BUDGET_ELEMENTS: AccountBudgetElements = {
	Card: ({ children }) => <section className={cn(CARD_CLASS, "space-y-4")}>{children}</section>,
	Text: ({ children, className }) => <span className={className}>{children}</span>,
	Heading: ({ children }) => <h2 className="font-semibold">{children}</h2>,
	CardTop: ({ children }) => (
		<div className="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-start">{children}</div>
	),
	CardTopRow: ({ children }) => <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">{children}</div>,
	CardTopStart: ({ children }) => <div className="min-w-0">{children}</div>,
	CardTopEnd: ({ children }) => <div className="min-w-0 text-right">{children}</div>,
	Meters: ({ children }) => <div className="flex flex-wrap justify-center gap-8">{children}</div>,
	Meter: ({ children }) => <div className="flex flex-col items-center gap-1.5">{children}</div>,
	MeterRing,
	PlanRow: ({ children }) => <div className="flex flex-wrap items-center gap-3">{children}</div>,
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
