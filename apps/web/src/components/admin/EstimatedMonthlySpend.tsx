// the admin console's estimated monthly spend: a table of the worst case free-plan spend for the month and its share of
// each day left at the past days' daily signup average and at each compared rate, each limited by the highest typed
// cutoff and beside the month without cutoffs, over the most spend this month and a slider that picks the past days.
// under it a second table shows how long after midnight UTC each typed cutoff is passed at those rates, over a slider
// for each cutoff and the buttons that save, reset, and default the cutoffs together

import type { DailySpendCutoffKind, WorstCaseMonthlySpend } from "@carlnotes/contracts/admin"
import { useNow } from "@carlnotes/core/hooks/useNow"
import { capitalize, toWholeDollarLabel } from "@carlnotes/core/lib/labels"
import {
	DAILY_SIGNUP_RATES,
	toCutoffMonthlySpendCents,
	toCutoffPassDurationLabel,
	toDailySignupAverage,
	toPerDaySpendCents,
	toWorstCaseMonthlySpendCents,
} from "@carlnotes/core/lib/worstCaseMonthlySpend"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Slider } from "@/components/primitives/slider"
import { TABLE_HEAD_CLASS } from "@/lib/tableClasses"

// the daily signup rate whose spend per day sets the cutoff sliders' end
const CUTOFF_SLIDER_SIGNUP_RATE = 1_000

// the padding of every cell but a row's last
const CELL_CLASS = "py-1.5 pr-4 last:pr-0 sm:pr-8"

// one typed cutoff: its kind, its column's label, its slider's label, and its value in cents
type EstimatedMonthlySpendCutoff = {
	kind: DailySpendCutoffKind
	columnLabel: string
	sliderLabel: string
	value: number
}

// one daily signup rate with its monthly spend and spend per day, each without cutoffs and limited by the highest one
type SignupRateRow = {
	signupRate: number
	isPastDaysRate: boolean
	monthlySpendCents: number
	perDaySpendCents: number
	cutoffMonthlySpendCents: number
	cutoffPerDaySpendCents: number
}

type EstimatedMonthlySpendProps = {
	worstCaseMonthlySpend: WorstCaseMonthlySpend
	cutoffs: EstimatedMonthlySpendCutoff[]
	isCutoffChanged: boolean
	isEveryCutoffDefault: boolean
	onCutoffChange: (kind: DailySpendCutoffKind, dollars: number) => void
	onCutoffSave: () => void
	onCutoffReset: () => void
	onCutoffDefaults: () => void
}

/**
 * Renders the worst case monthly spend at each daily signup rate with and without the cutoffs over the most spend this
 * month and the past days slider, then the time each cutoff is passed at those rates over a slider for each cutoff and
 * the cutoffs' Save, Reset, and Defaults buttons.
 */
export function EstimatedMonthlySpend({
	worstCaseMonthlySpend,
	cutoffs,
	isCutoffChanged,
	isEveryCutoffDefault,
	onCutoffChange,
	onCutoffSave,
	onCutoffReset,
	onCutoffDefaults,
}: EstimatedMonthlySpendProps) {
	// how many past days the average reads, every day read at first
	const { dailySignupCounts } = worstCaseMonthlySpend
	const [pastDayCount, setPastDayCount] = useState(dailySignupCounts.length)

	// the past days' rate to one decimal among the compared rates, lowest first
	const now = useNow()
	const pastDaysRate = Math.round(toDailySignupAverage(dailySignupCounts, pastDayCount) * 10) / 10
	const signupRates = [...new Set([pastDaysRate, ...DAILY_SIGNUP_RATES])].sort((first, second) => first - second)
	const pastDaysLabel = pastDayCount === 1 ? "past day" : `past ${pastDayCount} days`

	// the spend per day at a daily signup rate
	const toRatePerDaySpendCents = (dailySignupRate: number): number =>
		toPerDaySpendCents(toWorstCaseMonthlySpendCents({ worstCaseMonthlySpend, dailySignupRate, now }), now)

	// the highest cutoff, past which every kind of spend a cutoff pauses has stopped, and the most spend this month at it
	const highestCutoffCents = Math.max(...cutoffs.map((cutoff) => cutoff.value))
	const mostMonthlySpendCents = toCutoffMonthlySpendCents({
		monthlySpendCents: Number.POSITIVE_INFINITY,
		highestCutoffCents,
		now,
	})

	// each rate's monthly spend and spend per day without cutoffs and limited by the highest one, which both tables read
	const signupRateRows: SignupRateRow[] = signupRates.map((signupRate) => {
		const monthlySpendCents = toWorstCaseMonthlySpendCents({ worstCaseMonthlySpend, dailySignupRate: signupRate, now })
		const cutoffMonthlySpendCents = toCutoffMonthlySpendCents({
			monthlySpendCents,
			highestCutoffCents,
			now,
		})
		return {
			signupRate,
			isPastDaysRate: signupRate === pastDaysRate,
			monthlySpendCents,
			perDaySpendCents: toPerDaySpendCents(monthlySpendCents, now),
			cutoffMonthlySpendCents,
			cutoffPerDaySpendCents: toPerDaySpendCents(cutoffMonthlySpendCents, now),
		}
	})

	// the cutoff sliders end at the spend per day at the cutoff slider signup rate, or further for a cutoff above it
	const cutoffSliderMaxDollars = Math.max(
		Math.ceil(toRatePerDaySpendCents(CUTOFF_SLIDER_SIGNUP_RATE) / 100),
		...cutoffs.map((cutoff) => Math.ceil(cutoff.value / 100)),
	)

	return (
		<div className="mt-6 space-y-6">
			{/* the monthly spend table with the past days slider under it at its width */}
			<div className="space-y-3">
				<h4 className="text-sm font-semibold">
					Estimated monthly spend{" "}
					<span className="text-muted-foreground font-normal">if free users use their whole budget</span>
				</h4>
				<div className="w-fit max-w-full space-y-4">
					<div className="overflow-x-auto">
						<table className="text-sm tabular-nums">
							<thead className={TABLE_HEAD_CLASS}>
								<tr>
									<th className={cn(CELL_CLASS, "text-left align-bottom font-normal")}>Daily signups</th>
									<th className={cn(CELL_CLASS, "text-right align-bottom font-normal")}>Monthly spend limit</th>
									<th className={cn(CELL_CLASS, "text-right align-bottom font-normal")}>Per day</th>
									<th className={cn(CELL_CLASS, "text-right align-bottom font-normal")}>Without cutoffs</th>
								</tr>
							</thead>
							<tbody>
								{signupRateRows.map((signupRateRow) => (
									<tr key={signupRateRow.signupRate} className={toRowClass(signupRateRow.isPastDaysRate)}>
										<DailySignupsCell signupRateRow={signupRateRow} pastDaysLabel={pastDaysLabel} />
										<td className={cn(CELL_CLASS, "text-right")}>
											{toRoundDollarsLabel(signupRateRow.cutoffMonthlySpendCents)}
										</td>
										<td className={cn(CELL_CLASS, "text-right")}>
											{toRoundDollarsLabel(signupRateRow.cutoffPerDaySpendCents)}
										</td>
										<td className={cn(CELL_CLASS, "text-muted-foreground text-right font-normal")}>
											{toRoundDollarsLabel(signupRateRow.monthlySpendCents)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{/* the most spend this month at the highest cutoff, and the spend it leaves out */}
					<div className="space-y-1">
						<p className="text-sm">
							Most this month{" "}
							<span className="font-semibold tabular-nums">{toRoundDollarsLabel(mostMonthlySpendCents)}</span>{" "}
							<span className="text-muted-foreground">at {toWholeDollarLabel(highestCutoffCents)} a day</span>
						</p>
						<p className="text-muted-foreground text-xs">
							First scans and a topic's first podcast episode can still add to it.
						</p>
					</div>
					{/* the past days slider with its count below it */}
					<div className="space-y-2">
						<Slider
							aria-label="Past days"
							min={1}
							max={dailySignupCounts.length}
							step={1}
							value={[pastDayCount]}
							onValueChange={([nextPastDayCount]) => setPastDayCount(nextPastDayCount ?? pastDayCount)}
						/>
						<p className="text-muted-foreground text-xs">{capitalize(pastDaysLabel)}</p>
					</div>
				</div>
			</div>
			{/* the cutoff times table with the cutoff sliders and buttons under it at its width */}
			<div className="space-y-3">
				<h4 className="text-sm font-semibold">
					Time from midnight UTC to each cutoff{" "}
					<span className="text-muted-foreground font-normal">if spend comes in at an even pace through the day</span>
				</h4>
				<div className="max-w-4xl space-y-4">
					<div className="overflow-x-auto">
						<table className="w-full text-sm tabular-nums">
							<thead className={TABLE_HEAD_CLASS}>
								<tr>
									<th className={cn(CELL_CLASS, "text-left align-bottom font-normal")}>Daily signups</th>
									{cutoffs.map((cutoff) => (
										<th key={cutoff.kind} className={cn(CELL_CLASS, "text-right align-bottom font-normal")}>
											{cutoff.columnLabel}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{signupRateRows.map((signupRateRow) => (
									<tr key={signupRateRow.signupRate} className={toRowClass(signupRateRow.isPastDaysRate)}>
										<DailySignupsCell signupRateRow={signupRateRow} pastDaysLabel={pastDaysLabel} />
										{cutoffs.map((cutoff) => (
											<CutoffPassDurationCell
												key={cutoff.kind}
												passDurationLabel={toCutoffPassDurationLabel({
													cutoffCents: cutoff.value,
													perDaySpendCents: signupRateRow.perDaySpendCents,
												})}
											/>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{/* a slider for each cutoff with its label and value above it */}
					{cutoffs.map((cutoff) => (
						<div key={cutoff.kind} className="space-y-2">
							<div className="flex justify-between gap-4 text-sm">
								<span>{cutoff.sliderLabel}</span>
								<span className="tabular-nums">{toWholeDollarLabel(cutoff.value)}</span>
							</div>
							<Slider
								aria-label={cutoff.sliderLabel}
								min={1}
								max={cutoffSliderMaxDollars}
								step={1}
								value={[Math.round(cutoff.value / 100)]}
								onValueChange={([dollars]) => dollars !== undefined && onCutoffChange(cutoff.kind, dollars)}
							/>
						</div>
					))}
					{/* the cutoffs' save and reset, idle until a cutoff changes, and the defaults, idle while every cutoff reads its
					    default */}
					<div className="flex gap-2">
						<Button size="sm" disabled={!isCutoffChanged} onClick={onCutoffSave}>
							Save daily cutoffs
						</Button>
						<Button size="sm" variant="outline" disabled={!isCutoffChanged} onClick={onCutoffReset}>
							Reset
						</Button>
						<Button size="sm" variant="outline" disabled={isEveryCutoffDefault} onClick={onCutoffDefaults}>
							Defaults
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

type DailySignupsCellProps = {
	signupRateRow: SignupRateRow
	pastDaysLabel: string
}

// a row's daily signup rate, marked with the past days it reads if it is their average
function DailySignupsCell({ signupRateRow, pastDaysLabel }: DailySignupsCellProps) {
	return (
		<td className={CELL_CLASS}>
			{signupRateRow.signupRate.toLocaleString("en-US")}
			{signupRateRow.isPastDaysRate && (
				<span className="text-primary block text-xs whitespace-nowrap sm:ml-2 sm:inline">{pastDaysLabel}</span>
			)}
		</td>
	)
}

// how long after midnight UTC a cutoff is passed, or a muted Not reached if the day's spend stays under it
function CutoffPassDurationCell({ passDurationLabel }: { passDurationLabel: string | null }) {
	return passDurationLabel === null ? (
		<td className={cn(CELL_CLASS, "text-muted-foreground text-right font-normal")}>Not reached</td>
	) : (
		<td className={cn(CELL_CLASS, "text-right whitespace-nowrap")}>{passDurationLabel}</td>
	)
}

// a row's divider, and the past days' row in full color
function toRowClass(isPastDaysRate: boolean): string {
	return cn("border-b last:border-b-0", isPastDaysRate ? "text-foreground font-medium" : "text-muted-foreground")
}

// a spend in cents rounded to whole dollars as a label, as in "$4,500"
function toRoundDollarsLabel(cents: number): string {
	return toWholeDollarLabel(Math.round(cents / 100) * 100)
}
