// the day's free-plan spend on a bar with a circle at each daily spend cutoff, under a ring of the time left until the
// cutoffs reset, over the list of each cutoff's input beside what it stops

import { useNow } from "@carlnotes/core/hooks/useNow"
import { toCentsLabel, toWholeDollarLabel } from "@carlnotes/core/lib/labels"
import { toMeterMarkerGroups } from "@carlnotes/core/lib/spendMeter"
import { toHoursMinutesLabel, toUtcDayReset } from "@carlnotes/core/lib/utcResets"
import type { ReactNode } from "react"
import type { AdminDailySpendCutoff } from "@/components/admin/spendControlDraft"
import { MeterBar } from "@/components/common/MeterBar"
import { MeterCutoffList } from "@/components/common/MeterCutoffList"
import { MeterMarker } from "@/components/common/MeterMarker"
import { MeterRing } from "@/components/common/MeterRing"
import { TooltipSection } from "@/components/common/UpdateCountBadge"

// one cutoff on the meter at its typed value, with what passing it stops
type FreePlanSpendMeterCutoff = AdminDailySpendCutoff & { line: string }

type FreePlanSpendMeterProps = {
	freePlanSpendCents: number
	cutoffs: FreePlanSpendMeterCutoff[]
	renderCutoffInput: (cutoff: FreePlanSpendMeterCutoff) => ReactNode
}

/**
 * Renders the day's free-plan spend on a bar that ends at the highest cutoff, with a circle at each cutoff and the list
 * of each cutoff's input beside what it stops. Its title sits at the top left beside the reset clock.
 */
export function FreePlanSpendMeter({ freePlanSpendCents, cutoffs, renderCutoffInput }: FreePlanSpendMeterProps) {
	// the cutoffs lowest first and the bar's end at the highest one
	const sortedCutoffs = [...cutoffs].sort((first, second) => first.value - second.value)
	const meterEndCents = sortedCutoffs.at(-1)?.value ?? freePlanSpendCents
	const toMeterShare = (cents: number): number => cents / meterEndCents

	// the list keeps the order of the defaults, so a field being typed in stays in place
	const listedCutoffs = [...cutoffs].sort((first, second) => first.defaultValue - second.defaultValue)

	return (
		<div>
			{/* the title at the top left, the reset clock at the top center, and the spend at the top right */}
			<div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
				<h3 className="font-semibold">Free plan budget today</h3>
				<ResetClock />
				<span className="text-muted-foreground justify-self-end text-sm">
					{toCentsLabel(freePlanSpendCents)} of {toCentsLabel(meterEndCents)}
				</span>
			</div>
			<MeterBar
				segments={[
					{
						key: "freePlanSpend",
						colorClass: "bg-primary",
						widthPercent: Math.min(100, toMeterShare(freePlanSpendCents) * 100),
					},
				]}
				hasMarkers
			>
				{toMeterMarkerGroups(sortedCutoffs, (cutoff) => toMeterShare(cutoff.value)).map(({ percent, items }) => (
					<DailySpendCutoffMarker key={items[0]?.kind} percent={percent} cutoffs={items} />
				))}
			</MeterBar>
			<MeterCutoffList
				cutoffRows={listedCutoffs.map((cutoff) => ({
					key: cutoff.kind,
					label: renderCutoffInput(cutoff),
					line: cutoff.line,
					isPassed: cutoff.isPassed,
				}))}
			/>
		</div>
	)
}

// one circle on the free-plan spend bar, faded once its lowest cutoff is passed, with what each of its cutoffs stops
function DailySpendCutoffMarker({ percent, cutoffs }: { percent: number; cutoffs: FreePlanSpendMeterCutoff[] }) {
	// each cutoff's heading, which the tooltip and the screen reader name both use
	const cutoffHeadings = cutoffs.map((cutoff) => `At ${toWholeDollarLabel(cutoff.value)}`)
	return (
		<MeterMarker
			percent={percent}
			label={toWholeDollarLabel(cutoffs[0]?.value ?? 0)}
			ariaLabel={cutoffs.map((cutoff, i) => `${cutoffHeadings[i]}: ${cutoff.line}`).join(" ")}
			isPassed={cutoffs[0]?.isPassed ?? false}
		>
			<div className="space-y-1.5">
				{cutoffs.map((cutoff, i) => (
					<TooltipSection
						key={cutoff.kind}
						heading={cutoffHeadings[i]}
						tooltipLines={[{ key: cutoff.kind, line: cutoff.line }]}
					/>
				))}
			</div>
		</MeterMarker>
	)
}

// a ring at the meter's top center whose arc is the share of the UTC day left with the time left inside it. the clock
// re-reads the time each minute
function ResetClock() {
	// the time left until midnight UTC as a label and a share of the day
	const dayReset = toUtcDayReset(useNow())
	const resetTimeLeftLabel = toHoursMinutesLabel(dayReset.timeLeftMs)
	return (
		<div className="flex flex-col items-center gap-1.5">
			<MeterRing
				share={dayReset.share}
				centerText={resetTimeLeftLabel}
				centerSubtext="until reset"
				ariaLabel={`${resetTimeLeftLabel} until the cutoffs reset at midnight UTC`}
			/>
			<p className="text-muted-foreground text-xs">Cutoffs reset at midnight UTC</p>
		</div>
	)
}
