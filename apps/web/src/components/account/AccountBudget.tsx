import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import {
	type AccountBudgetElements,
	AccountBudget as SharedAccountBudget,
} from "@carlnotes/core/components/AccountBudget"
import { cn } from "@carlnotes/nightshift/classNames"
import { Settings } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { openBillingPortal } from "@/lib/billingRedirects"
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

// a failed-payment notice with a path to fix payment in the portal
function PaymentNotice() {
	return (
		<div className="border-destructive bg-card rounded-md border p-3 text-sm">
			<p className="text-destructive font-semibold">Your last payment didn't go through.</p>
			<p className="text-muted-foreground">
				<Button className="mt-1 mr-2" onClick={() => openBillingPortal()}>
					Update
				</Button>
				your payment method to keep Carl brewing.
			</p>
		</div>
	)
}

// a subscribed user manages billing through the portal, and a free user selects a plan on the plans page.
export function PlanButton({ billing }: { billing: BillingState }) {
	const [isRedirecting, setIsRedirecting] = useState(false)

	// send the user to the Stripe billing portal
	async function handleManage(): Promise<void> {
		setIsRedirecting(true)
		const isOpened = await openBillingPortal()
		if (!isOpened) {
			setIsRedirecting(false)
		}
	}

	if (isPaidPlan(billing.plan)) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button onClick={handleManage} disabled={isRedirecting}>
						<Settings className="size-4" />
						{PURCHASE_COPY.managePlan}
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
