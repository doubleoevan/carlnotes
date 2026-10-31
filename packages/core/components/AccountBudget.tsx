import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { BillingProvider } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import type { ComponentType, ReactNode } from "react"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type AccountBudgetElements = {
	Card: Container
	Group: Container
	Text: Container
	Heading: Container
	// the failed-payment notice, whose Update opens where the provider bills the plan
	PaymentNotice: ComponentType<{ provider: BillingProvider | null }>
}

/**
 * Composes the payment notice, spending, scan usage, and current plan for both account screens.
 */
export function AccountBudget({
	billing,
	isReadOnly = false,
	spendMeter,
	elements: { Card, Group, Text, Heading, PaymentNotice },
}: {
	billing: BillingState
	isReadOnly?: boolean
	spendMeter: ReactNode
	elements: AccountBudgetElements
}) {
	// the payment and daily-limit conditions
	const isPastDue = billing.status === "past_due" || billing.status === "unpaid"
	const isAtLimit = billing.dailyScansUsed >= billing.dailyScanLimit
	return (
		<>
			{isPastDue && !isReadOnly && <PaymentNotice provider={billing.provider} />}
			<Card>
				{spendMeter}
				<Group>
					<Heading>Brews today</Heading>
					<Text className="text-muted-foreground">
						{billing.dailyScansUsed} of {billing.dailyScanLimit} used
					</Text>
					{isAtLimit && (
						<Text className="text-sm">
							{billing.isOverageBillable
								? "Extra scans beyond your daily limit are billed by the scan."
								: "You have reached your daily limit."}
						</Text>
					)}
				</Group>
				<Text>
					<Text className="font-semibold">Plan </Text>
					<Text className="text-muted-foreground capitalize">{billing.plan}</Text>
					{isPaidPlan(billing.plan) && (
						<Text className="text-muted-foreground">{`, billed ${billing.billingInterval}`}</Text>
					)}
				</Text>
			</Card>
		</>
	)
}
