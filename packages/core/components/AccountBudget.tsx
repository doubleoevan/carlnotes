import type { MonthlySpend } from "@carlnotes/contracts/activity"
import type { BillingProvider } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import type { ComponentType, ReactNode } from "react"
import { useNow } from "../hooks/useNow"
import { toSpendAmountLabel } from "../lib/spendMeter"
import { toRegenerationCountLabel } from "../lib/topicImageEditor"
import { toDaysLabel, toHoursMinutesLabel, toUtcDayReset, toUtcMonthReset } from "../lib/utcResets"
import type { MeterRingProps } from "./MeterRing"

type Container = ComponentType<{ children: ReactNode; className?: string }>
export type AccountBudgetElements = {
	Card: Container
	Text: Container
	Heading: Container
	// a card's top with its title at the left and its meters at the center, which stacks on a phone
	CardTop: Container
	// a card's top row on every width, with its start side, its meter at the center, and its end side
	CardTopRow: Container
	CardTopStart: Container
	CardTopEnd: Container
	// the centered row of meters with a gap between them, one meter's ring over its caption, and the ring
	Meters: Container
	Meter: Container
	MeterRing: ComponentType<MeterRingProps>
	// a card's one label line, as the month's image regenerations under the coffee fund's meter
	CardLine: Container
	// the failed-payment notice, whose Update opens where the provider bills the plan
	PaymentNotice: ComponentType<{ provider: BillingProvider | null }>
}

/**
 * Composes the payment notice and the coffee fund and daily scans cards, each with its title at the top left beside its
 * meters, for both account screens.
 */
export function AccountBudget({
	billing,
	isReadOnly = false,
	activity,
	spendMeter,
	elements,
}: {
	billing: BillingState
	isReadOnly?: boolean
	activity: MonthlySpend | null
	spendMeter: ReactNode
	elements: AccountBudgetElements
}) {
	// the elements and the payment and daily-limit conditions
	const {
		Card,
		Text,
		Heading,
		CardTop,
		CardTopRow,
		CardTopStart,
		CardTopEnd,
		Meters,
		Meter,
		MeterRing,
		CardLine,
		PaymentNotice,
	} = elements
	const isPastDue = billing.status === "past_due" || billing.status === "unpaid"
	const isAtLimit = billing.dailyScansUsed >= billing.dailyScanLimit

	// the time left until the coffee fund resets on the first of the UTC month in days and until the daily scan limit
	// resets at midnight UTC in hours. each ring re-reads the time each minute
	const now = useNow()
	const monthReset = toUtcMonthReset(now)
	const dayReset = toUtcDayReset(now)
	const monthResetLabel = toDaysLabel(monthReset.timeLeftMs)
	const dayResetLabel = toHoursMinutesLabel(dayReset.timeLeftMs)

	// the scans used today against the daily limit, with the limit's note once it is reached
	const dailyScansLabel = `${billing.dailyScansUsed} of ${billing.dailyScanLimit}`
	const dailyLimitNote = billing.isOverageBillable
		? "Extra scans beyond your daily limit are billed by the scan."
		: "You have reached your daily limit."

	return (
		<>
			{isPastDue && !isReadOnly && <PaymentNotice provider={billing.provider} />}
			{/* the coffee fund with its title, reset clock, and amount at the top, the meter, and the month's image
			    regenerations */}
			<Card>
				<CardTopRow>
					<CardTopStart>
						<Heading>Carl's coffee fund</Heading>
					</CardTopStart>
					<Meter>
						<MeterRing
							share={monthReset.share}
							centerText={monthResetLabel}
							ariaLabel={`${monthResetLabel} until Coffee fund reset`}
						/>
						<Text className="text-muted-foreground text-xs">until Coffee fund reset</Text>
					</Meter>
					<CardTopEnd>
						{activity && <Text className="text-muted-foreground text-sm">{toSpendAmountLabel(activity)}</Text>}
					</CardTopEnd>
				</CardTopRow>
				{spendMeter}
				{billing.imageRegenerationQuota && (
					<CardLine>
						<Text>
							<Text className="font-semibold">Image regenerations </Text>
							<Text className="text-muted-foreground">{toRegenerationCountLabel(billing.imageRegenerationQuota)}</Text>
						</Text>
					</CardLine>
				)}
			</Card>
			{/* the daily scans with their title, and the scans used beside the reset clock */}
			<Card>
				<CardTop>
					<Heading>Brews today</Heading>
					<Meters>
						<Meter>
							<MeterRing
								share={billing.dailyScanLimit > 0 ? billing.dailyScansUsed / billing.dailyScanLimit : 1}
								centerText={dailyScansLabel}
								centerSubtext="used"
								ariaLabel={`${dailyScansLabel} brews used today.${isAtLimit ? ` ${dailyLimitNote}` : ""}`}
							/>
							{isAtLimit && <Text className="text-foreground max-w-40 text-center text-xs">{dailyLimitNote}</Text>}
						</Meter>
						<Meter>
							<MeterRing
								share={dayReset.share}
								centerText={dayResetLabel}
								ariaLabel={`${dayResetLabel} until Brew limit reset`}
							/>
							<Text className="text-muted-foreground text-xs">until Brew limit reset</Text>
						</Meter>
					</Meters>
				</CardTop>
			</Card>
		</>
	)
}
