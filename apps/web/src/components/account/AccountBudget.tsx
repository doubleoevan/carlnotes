import type { ActivityResponse } from "@carlnotes/contracts/activity"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { Settings } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { openBillingPortal } from "@/lib/billingRedirects"
import { CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
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
	// past_due and unpaid are the failed-payment statuses Stripe reports
	const isPastDue = billing.status === "past_due" || billing.status === "unpaid"
	return (
		<>
			{isPastDue && !isReadOnly ? <PaymentNotice /> : null}
			{/* the fund, today's brews, and the plan all show what this account is spending, so one card
			    holds them, spaced apart instead of ruled off */}
			<section className={cn(CARD_CLASS, "space-y-4")}>
				{activity && (
					<SpendMeter
						scanSpendCents={activity.scanSpendCents}
						chatSpendCents={activity.chatSpendCents}
						podcastEpisodeSpendCents={activity.podcastEpisodeSpendCents}
						budgetCents={activity.budgetCents}
						monthlyBudgetCutoffs={activity.monthlyBudgetCutoffs}
					/>
				)}
				<ScanUsageSection billing={billing} />
				<PlanSection billing={billing} />
			</section>
		</>
	)
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

// scan usage against the daily limit, plus the overage or limit-reached note once at the limit
function ScanUsageSection({ billing }: { billing: BillingState }) {
	const isAtLimit = billing.dailyScansUsed >= billing.dailyScanLimit
	return (
		<div>
			<h2 className="font-semibold">Brews today</h2>
			<p className="text-muted-foreground">
				{billing.dailyScansUsed} of {billing.dailyScanLimit} used
			</p>
			{isAtLimit ? (
				<p className="text-sm">
					{billing.hasPaymentMethod
						? "Extra scans beyond your daily limit are billed by the scan."
						: "You have reached your daily limit."}
				</p>
			) : null}
		</div>
	)
}

// the current plan and how often it bills
function PlanSection({ billing }: { billing: BillingState }) {
	return (
		<div>
			<p>
				<span className="font-semibold">{"Plan "}</span>
				<span className="text-muted-foreground capitalize">{billing.plan}</span>
				{/* monthly or yearly billing interval. free has no subscription */}
				{billing.plan !== "free" && (
					<span className="text-muted-foreground">{`, billed ${billing.billingInterval}`}</span>
				)}
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

	if (billing.plan !== "free") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button onClick={handleManage} disabled={isRedirecting}>
						<Settings className="size-4" />
						Manage plan
					</Button>
				</TooltipTrigger>
				<TooltipContent>Manage your plan</TooltipContent>
			</Tooltip>
		)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href="/plans" className={cn(buttonVariants({ variant: "default" }))}>
					<Settings className="size-4" />
					Upgrade
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent>Manage your plan</TooltipContent>
		</Tooltip>
	)
}
