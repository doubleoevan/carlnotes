import type { ActivityResponse, BillingState } from "@shared/contracts"
import { Settings } from "lucide-react"
import { useState } from "react"
import { openBillingPortal } from "@/clients/billingClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { toCentsLabel } from "@/lib/labels"
import { CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

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
					<SpendSection
						scanSpendCents={activity.scanSpendCents}
						chatSpendCents={activity.chatSpendCents}
						budgetCents={activity.budgetCents}
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

// messages for each percentage of the budget spent, lowest threshold last so the first match wins.
const BUDGET_MESSAGES = [
	{ budgetUsedPercent: 100, line: "Dry until the 1st. Carl is still reading. He just can't file notes." },
	{ budgetUsedPercent: 90, line: "Nearly out." },
	{ budgetUsedPercent: 60, line: "Getting low." },
	{ budgetUsedPercent: 0, line: "Full pot." },
] as const

// the progress bar of metered spend against the monthly budget, scans and chat as their own segments of one bar
function SpendSection({
	scanSpendCents,
	chatSpendCents,
	budgetCents,
}: {
	scanSpendCents: number
	chatSpendCents: number
	budgetCents: number
}) {
	// each segment's share of the budget, and the total the label reads
	const totalCents = scanSpendCents + chatSpendCents
	const toPercent = (cents: number) => (budgetCents > 0 ? Math.min(100, (cents / budgetCents) * 100) : 0)

	// the budget percent and message
	const budgetUsedPercent = budgetCents > 0 ? Math.round(toPercent(totalCents)) : 100
	const budgetMessage =
		BUDGET_MESSAGES.find((message) => budgetUsedPercent >= message.budgetUsedPercent) ?? BUDGET_MESSAGES[0]

	return (
		<div>
			<div className="flex items-baseline justify-between">
				<h2 className="font-semibold">Carl's coffee fund</h2>
				<span className="text-muted-foreground text-sm">
					{toCentsLabel(totalCents)} of {toCentsLabel(budgetCents)}
				</span>
			</div>

			{/* one bar, two segments. the scan segment sits left in the primary color and the chat segment right in spend-chat */}
			<div className="bg-muted mt-2 flex h-3 overflow-hidden rounded-full">
				<div className="bg-primary h-full" style={{ width: `${toPercent(scanSpendCents)}%` }} />
				<div className="bg-spend-chat h-full" style={{ width: `${toPercent(chatSpendCents)}%` }} />
			</div>

			{/* the key, so the two segments are readable without hovering */}
			<div className="text-muted-foreground mt-2 flex gap-4 text-xs">
				<span className="flex items-center gap-1.5">
					<span className="bg-primary size-2 rounded-full" />
					Brews {toCentsLabel(scanSpendCents)}
				</span>
				<span className="flex items-center gap-1.5">
					<span className="bg-spend-chat size-2 rounded-full" />
					Coffee talk {toCentsLabel(chatSpendCents)}
				</span>
			</div>
			{/* the budget percent and message */}
			<p className="text-muted-foreground mt-1 text-xs">
				<span className="text-sm">{budgetUsedPercent}%</span> {budgetMessage.line}
				{budgetUsedPercent >= 100 && (
					<>
						{" "}
						<AnchorLink href="/plans" className="underline">
							Pick up some coffee.
						</AnchorLink>
					</>
				)}
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
