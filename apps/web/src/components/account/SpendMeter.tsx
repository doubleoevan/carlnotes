import {
	type CutoffMarker,
	type SpendMeterProps,
	toCutoffClause,
	toCutoffMarkerState,
	toCutoffMarkers,
	toSpendMeterModel,
	toSpendMeterStatusLine,
} from "@carlnotes/core/lib/spendMeter"

export { toCutoffMarkers, toSpendMeterStatusLine } from "@carlnotes/core/lib/spendMeter"

import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import { toCentsLabel, toSharePercentLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { MeterBar } from "@/components/common/MeterBar"
import { MeterCutoffList } from "@/components/common/MeterCutoffList"
import { MeterMarker } from "@/components/common/MeterMarker"
import { TooltipSection } from "@/components/common/UpdateCountBadge"
import { MONTHLY_BUDGET_CUTOFF_COPY } from "./monthlyBudgetCutoffCopy"

/**
 * The progress bar of metered spend against the monthly budget, with scans, podcast episodes, and chat as segments of
 * one bar. Each cutoff is a circle above the bar with a line down through it, and a list under the bar says what each
 * one stops. An admin viewing another user's account sees no upgrade link.
 */
export function SpendMeter({ isReadOnly = false, ...props }: SpendMeterProps & { isReadOnly?: boolean }) {
	// read the shared amounts, segments, legend, and upgrade visibility
	const { monthlyBudgetCutoffs } = props
	const {
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
			{/* the budget percentage segments under the cutoff circles */}
			<MeterBar segments={spendSegments} hasMarkers={hasMonthlyBudgetCutoffs}>
				{toCutoffMarkers(monthlyBudgetCutoffs).map((cutoffMarker) => (
					<CutoffMarkerCircle
						key={cutoffMarker.monthlyBudgetCutoffs[0]?.kind}
						cutoffMarker={cutoffMarker}
						budgetUsedShare={budgetUsedShare}
					/>
				))}
			</MeterBar>

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

			{/* the budget percent and the status line, with the upgrade link once the budget is spent outside a read-only view */}
			<p className="text-muted-foreground mt-1 text-xs">
				<span className="text-sm">{budgetUsedPercent}%</span>{" "}
				{toSpendMeterStatusLine({ budgetUsedShare, monthlyBudgetCutoffs })}
				{isUpgradeVisible && !isReadOnly && (
					<>
						{" "}
						<AnchorLink href={PLANS_PATH} className="sentence-link">
							{PURCHASE_COPY.pickUpSomeCoffee}
						</AnchorLink>
					</>
				)}
			</p>
			{/* what each cutoff stops, ending with the spent budget */}
			{hasMonthlyBudgetCutoffs && (
				<MeterCutoffList
					cutoffRows={cutoffRows.map((cutoffRow) => ({
						key: cutoffRow.key,
						label: toSharePercentLabel(cutoffRow.budgetShare),
						line: cutoffRow.line,
						isPassed: budgetUsedShare >= cutoffRow.budgetShare,
					}))}
				/>
			)}
		</div>
	)
}

// one circle above the bar, with a tooltip that says what each of its cutoffs stops. a passed circle fades, and the
// daily scans cutoff, which moves each day, has a dashed edge
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
		<MeterMarker
			percent={percent}
			label={`${percent}%`}
			ariaLabel={cutoffHeadings.join(". ")}
			isPassed={isCutoffMarkerPassed}
			isMoving={isCutoffMarkerMoving}
		>
			<div className="space-y-1.5">
				{monthlyBudgetCutoffs.map((cutoff, i) => (
					<TooltipSection
						key={cutoff.kind}
						heading={cutoffHeadings[i]}
						tooltipLines={MONTHLY_BUDGET_CUTOFF_COPY[cutoff.kind].tooltipLines.map((line) => ({ key: line, line }))}
					/>
				))}
			</div>
		</MeterMarker>
	)
}
