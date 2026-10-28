import {
	type CutoffMarker,
	type SpendMeterModel,
	type SpendMeterProps,
	toCutoffClause,
	toCutoffMarkerState,
	toCutoffMarkers,
	toSpendMeterModel,
	toSpendMeterStatusLine,
} from "@carlnotes/core/lib/spendMeter"

export { toCutoffMarkers, toSpendMeterStatusLine } from "@carlnotes/core/lib/spendMeter"

import { toCentsLabel, toSharePercentLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TooltipSection } from "@/components/common/UpdateCountBadge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MONTHLY_BUDGET_CUTOFF_COPY } from "./monthlyBudgetCutoffCopy"

/**
 * The progress bar of metered spend against the monthly budget, with scans, podcast episodes, and chat as segments of
 * one bar. Each cutoff is a circle above the bar with a line down through it, and a list under the bar says what each
 * one stops.
 */
export function SpendMeter(props: SpendMeterProps) {
	// read the shared amounts, segments, legend, and upgrade visibility
	const { budgetCents, monthlyBudgetCutoffs } = props
	const {
		totalCents,
		budgetUsedShare,
		budgetUsedPercent,
		hasMonthlyBudgetCutoffs,
		isUpgradeVisible,
		spendSegments,
		legendSegments,
		cutoffRows,
	} = toSpendMeterModel(props)

	return (
		<div>
			<div className="flex items-baseline justify-between">
				<h2 className="font-semibold">Carl's coffee fund</h2>
				<span className="text-muted-foreground text-sm">
					{toCentsLabel(totalCents)} of {toCentsLabel(budgetCents)}
				</span>
			</div>

			{/* the budget percentage segments under the cutoff circles */}
			<div className={cn("relative mt-2", hasMonthlyBudgetCutoffs && "pt-7.5")}>
				<div className="bg-muted flex h-3 overflow-hidden rounded-full">
					{spendSegments.map(({ key, colorClass, widthPercent }) => (
						<div key={key} className={cn(colorClass, "h-full")} style={{ width: `${widthPercent}%` }} />
					))}
				</div>
				{toCutoffMarkers(monthlyBudgetCutoffs).map((cutoffMarker) => (
					<CutoffMarkerCircle
						key={cutoffMarker.monthlyBudgetCutoffs[0]?.kind}
						cutoffMarker={cutoffMarker}
						budgetUsedShare={budgetUsedShare}
					/>
				))}
			</div>

			{/* the key to each budget percent segment. the podcast episode entry shows only if there is podcast episode
			    spend */}
			<div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{legendSegments.map(({ key, colorClass, label, cents }) => (
					<span key={key} className="flex max-w-full items-center gap-1.5">
						<span className={cn(colorClass, "size-2 shrink-0 rounded-full")} />
						<span>{`${label} ${toCentsLabel(cents)}`}</span>
					</span>
				))}
			</div>

			{/* the budget percent and the status line, with the upgrade link once the budget is spent */}
			<p className="text-muted-foreground mt-1 text-xs">
				<span className="text-sm">{budgetUsedPercent}%</span>{" "}
				{toSpendMeterStatusLine({ budgetUsedShare, monthlyBudgetCutoffs })}
				{isUpgradeVisible && (
					<>
						{" "}
						<AnchorLink href="/plans" className="sentence-link">
							Pick up some coffee.
						</AnchorLink>
					</>
				)}
			</p>
			{hasMonthlyBudgetCutoffs && <MonthlyBudgetCutoffList cutoffRows={cutoffRows} budgetUsedShare={budgetUsedShare} />}
		</div>
	)
}

// one circle above the bar, with its line down to the bar's bottom edge and a tooltip that says what each of its
// cutoffs stops. a passed circle fades, and the daily scans cutoff, which moves each day, has a dashed edge
function CutoffMarkerCircle({
	cutoffMarker,
	budgetUsedShare,
}: {
	cutoffMarker: CutoffMarker
	budgetUsedShare: number
}) {
	// the circle reads as passed once its first cutoff is, and as moving if it marks the daily scans cutoff alone
	const { percent, monthlyBudgetCutoffs } = cutoffMarker
	const { isCutoffMarkerPassed, isCutoffMarkerMoving } = toCutoffMarkerState({ monthlyBudgetCutoffs, budgetUsedShare })
	const cutoffHeadings = monthlyBudgetCutoffs.map((cutoff) => `At ${toCutoffClause(cutoff)}`)

	return (
		<div
			className="absolute top-0 bottom-0 flex -translate-x-1/2 flex-col items-center"
			style={{ left: `${percent}%` }}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={cutoffHeadings.join(". ")}
						className={cn(
							"border-foreground bg-card text-foreground grid size-6.5 shrink-0 place-items-center rounded-full border-[1.5px] text-[9px] font-semibold tabular-nums",
							isCutoffMarkerMoving && "border-dashed",
							isCutoffMarkerPassed && "bg-muted border-muted-foreground/50 text-muted-foreground",
						)}
					>
						{percent}%
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-60">
					<div className="space-y-1.5">
						{monthlyBudgetCutoffs.map((cutoff, i) => (
							<TooltipSection
								key={cutoff.kind}
								heading={cutoffHeadings[i]}
								tooltipLines={MONTHLY_BUDGET_CUTOFF_COPY[cutoff.kind].tooltipLines.map((line) => ({ key: line, line }))}
							/>
						))}
					</div>
				</TooltipContent>
			</Tooltip>
			<div className={cn("bg-foreground -mt-px w-0.5 flex-1", isCutoffMarkerPassed ? "opacity-35" : "opacity-75")} />
		</div>
	)
}

// the list under the bar of what each cutoff stops, ending with the spent budget. a passed line is struck through
function MonthlyBudgetCutoffList({
	cutoffRows,
	budgetUsedShare,
}: Pick<SpendMeterModel, "cutoffRows" | "budgetUsedShare">) {
	return (
		<ul className="text-muted-foreground mt-3 space-y-1 text-xs">
			{cutoffRows.map((listRow) => {
				const isCutoffListRowPassed = budgetUsedShare >= listRow.budgetShare
				return (
					<li key={listRow.key} className="flex gap-2">
						<span className={cn("w-10 shrink-0 tabular-nums", !isCutoffListRowPassed && "text-foreground font-medium")}>
							{toSharePercentLabel(listRow.budgetShare)}
						</span>
						<span className={cn(isCutoffListRowPassed && "line-through")}>{listRow.line}</span>
					</li>
				)
			})}
		</ul>
	)
}
