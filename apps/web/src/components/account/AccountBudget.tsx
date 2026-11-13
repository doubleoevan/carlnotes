import type { ActivityResponse } from "@carlnotes/contracts/activity"
import type { BillingProvider } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import {
	type AccountBudgetElements,
	AccountBudget as SharedAccountBudget,
} from "@carlnotes/core/components/AccountBudget"
import { toPlanManagement } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { cn } from "@carlnotes/nightshift/classNames"
import type { ReactNode } from "react"
import { MeterRing } from "@/components/common/MeterRing"
import { Button } from "@/components/primitives/button"
import { openPlanManagement } from "@/lib/billingRedirects"
import { CARD_CLASS } from "@/lib/styleClasses"
import { SpendMeter } from "./SpendMeter"

/**
 * The budget section on the account page: the payment notice and the coffee fund and daily scans cards.
 */
export function AccountBudget({
	billing,
	activity,
	isReadOnly = false,
}: {
	billing: BillingState
	activity: ActivityResponse | null
	// an admin viewing another user's account does not see the payment notice or the upgrade link
	isReadOnly?: boolean
}) {
	return (
		<SharedAccountBudget
			billing={billing}
			isReadOnly={isReadOnly}
			elements={ACCOUNT_BUDGET_ELEMENTS}
			activity={activity}
			spendMeter={activity ? <SpendMeter {...activity} isReadOnly={isReadOnly} /> : null}
		/>
	)
}

// the account page's card and text styling around the shared budget, with no payment notice
export const ACCOUNT_BUDGET_LAYOUT_ELEMENTS: Omit<AccountBudgetElements, "PaymentNotice"> = {
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
	CardLine: ({ children }) => <p className="text-sm">{children}</p>,
}

// the page's layout with its notice, whose Update opens where the plan is billed
const ACCOUNT_BUDGET_ELEMENTS: AccountBudgetElements = { ...ACCOUNT_BUDGET_LAYOUT_ELEMENTS, PaymentNotice }

// a failed-payment notice whose Update opens where the plan is billed: the portal, or the store's subscription page
function PaymentNotice({ provider }: { provider: BillingProvider | null }) {
	return (
		<PaymentNoticeCard
			updateControl={
				<Button className="mt-1" onClick={() => void openPlanManagement(toPlanManagement("web", provider))}>
					Update
				</Button>
			}
		/>
	)
}

/**
 * The failed-payment notice around its Update control.
 */
export function PaymentNoticeCard({ updateControl }: { updateControl: ReactNode }) {
	return (
		<div className="border-destructive bg-card rounded-md border p-3 text-sm">
			<p className="text-destructive font-semibold">Your last payment didn't go through.</p>
			<p className="text-muted-foreground">
				<span className="mr-2">{updateControl}</span>
				your payment method to keep Carl brewing.
			</p>
		</div>
	)
}
