import type { ActivityResponse, BillingState } from "@shared/contracts"
import { useEffect, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { fetchActivity } from "@/lib/activityClient"
import { authClient } from "@/lib/authClient"
import { fetchBillingState, openBillingPortal } from "@/lib/billingClient"
import { cn, toCentsLabel } from "@/lib/utils"

// the section card chrome shared by the account page's panels
const SECTION_CARD_CLASS = "bg-card rounded-lg border p-4 shadow-lift"

/**
 * The account page: payment notice. the monthly spend against budget, the scan usage, and the current plan
 */
export function AccountPage() {
	const { data: session } = authClient.useSession()
	const [billing, setBilling] = useState<BillingState | null>(null)
	const [activity, setActivity] = useState<ActivityResponse | null>(null)

	// the billing state drives the panel, and the activity payload carries the spend meter's numbers
	useEffect(() => {
		if (session) {
			fetchBillingState().then(setBilling)
			fetchActivity().then(setActivity)
		}
	}, [session])

	if (!session) {
		return <main className="mx-auto max-w-4xl px-safe py-10">Please log in to manage your account.</main>
	}

	return (
		<main className="mx-auto max-w-4xl px-safe py-10">
			<h1 className="font-display text-2xl">Account</h1>
			{billing ? <BillingSection billing={billing} activity={activity} /> : <CoffeeLoading />}
		</main>
	)
}

// the billing section once the state has loaded: the payment notice the spend meter, scan usage, and the plan card
function BillingSection({ billing, activity }: { billing: BillingState; activity: ActivityResponse | null }) {
	// past_due and unpaid are the failed-payment statuses Stripe reports
	const isPastDue = billing.status === "past_due" || billing.status === "unpaid"
	return (
		<div className="mt-6 space-y-6">
			{isPastDue ? <PaymentNotice /> : null}
			{activity && (
				<SpendSection
					scanSpendCents={activity.scanSpendCents}
					chatSpendCents={activity.chatSpendCents}
					budgetCents={activity.budgetCents}
				/>
			)}
			<ScanUsageSection billing={billing} />
			<PlanSection billing={billing} />
		</div>
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
		<section className={SECTION_CARD_CLASS}>
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
						<AnchorLink href="/pricing" className="underline">
							Pick up some coffee.
						</AnchorLink>
					</>
				)}
			</p>
		</section>
	)
}

// scan usage against the daily limit, plus the overage or hard-cap note once at the limit
function ScanUsageSection({ billing }: { billing: BillingState }) {
	const isAtLimit = billing.dailyScansUsed >= billing.dailyScanLimit
	return (
		<section className={SECTION_CARD_CLASS}>
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
		</section>
	)
}

// the current plan and the upgrade action
function PlanSection({ billing }: { billing: BillingState }) {
	return (
		<section className={SECTION_CARD_CLASS}>
			<p>
				<span className="font-semibold">{"Plan "}</span>
				<span className="text-muted-foreground capitalize">{billing.plan}</span>
			</p>
			<div className="mt-4">
				<UpgradeAction billing={billing} />
			</div>
		</section>
	)
}

// a subscribed user manages billing through the portal, and a free user picks a plan on the pricing page
function UpgradeAction({ billing }: { billing: BillingState }) {
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
			<Button onClick={handleManage} disabled={isRedirecting}>
				Manage plan
			</Button>
		)
	}

	return (
		<AnchorLink href="/pricing" className={cn(buttonVariants({ variant: "default" }))}>
			Upgrade
		</AnchorLink>
	)
}
