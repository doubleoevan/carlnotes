import type { MonthlySpend } from "@carlnotes/contracts/activity"
import type { ComponentType, ReactNode } from "react"
import { toCentsLabel, toSharePercentLabel } from "../lib/labels"
import { MONTHLY_BUDGET_CUTOFF_COPY } from "../lib/monthlyBudgetCutoffCopy"
import {
	toCutoffClause,
	toCutoffMarkerState,
	toCutoffMarkers,
	toSpendAmountLabel,
	toSpendMeterModel,
	toSpendMeterStatusLine,
} from "../lib/spendMeter"

type Container = ComponentType<{ children: ReactNode }>

// one colored share of the bar, as a percent of its width
type MeterSegment = { key: string; colorClass: string; widthPercent: number }

// one cutoff under the meter: where it sits, what it stops, and whether the meter passed it
type MeterCutoffRow = { key: string; label: ReactNode; line: string; isPassed: boolean }

// one cutoff's detail behind a circle: its heading and the lines that say what it stops
type CutoffDetail = { heading: string; tooltipLines: string[] }

export type SpendMeterElements = {
	Root: Container
	// the progress bar's segments, with the circles above it and the spend a screen reader reads
	MeterBar: ComponentType<{
		segments: MeterSegment[]
		hasMarkers: boolean
		progress: { now: number; max: number; text: string }
		children: ReactNode
	}>
	// one circle above the bar, whose detail opens on hover or on tap
	MeterMarker: ComponentType<{
		percent: number
		label: string
		ariaLabel: string
		isPassed: boolean
		isMoving: boolean
		cutoffDetails: CutoffDetail[]
	}>
	// the key to each segment, one colored dot and label per segment
	Legend: Container
	LegendItem: ComponentType<{ colorClass: string; children: string }>
	// the status line under the legend, which leads with the budget's percent in a larger size
	StatusLine: Container
	StatusPercent: ComponentType<{ children: string }>
	MeterCutoffList: ComponentType<{ cutoffRows: MeterCutoffRow[] }>
}

/**
 * Composes the progress bar of metered spend against the monthly budget, with scans, podcast episodes, and chat as
 * segments of one bar. Each cutoff is a circle above the bar, and a list under the bar says what each one stops.
 */
export function SpendMeter({
	upgradeLink,
	elements: { Root, MeterBar, MeterMarker, Legend, LegendItem, StatusLine, StatusPercent, MeterCutoffList },
	...spendMeter
}: MonthlySpend & {
	// the plans link the status line ends with once the budget is spent, or null where none shows
	upgradeLink: ReactNode
	elements: SpendMeterElements
}) {
	// the shared amounts, segments, legend, and cutoff rows
	const { budgetCents, monthlyBudgetCutoffs } = spendMeter
	const {
		totalCents,
		budgetUsedShare,
		budgetUsedPercent,
		hasMonthlyBudgetCutoffs,
		isUpgradeVisible,
		spendSegments,
		legendSegments,
		cutoffRows,
	} = toSpendMeterModel(spendMeter)
	return (
		<Root>
			{/* the budget percentage segments under the cutoff circles. a circle reads as passed once its first cutoff is,
			    and as moving if it marks the daily scans cutoff alone */}
			<MeterBar
				segments={spendSegments}
				hasMarkers={hasMonthlyBudgetCutoffs}
				progress={{ now: Math.min(totalCents, budgetCents), max: budgetCents, text: toSpendAmountLabel(spendMeter) }}
			>
				{toCutoffMarkers(monthlyBudgetCutoffs).map(({ percent, monthlyBudgetCutoffs: markerCutoffs }) => {
					const { isCutoffMarkerPassed, isCutoffMarkerMoving } = toCutoffMarkerState({
						monthlyBudgetCutoffs: markerCutoffs,
						budgetUsedShare,
					})
					const cutoffDetails = markerCutoffs.map((cutoff) => ({
						heading: `At ${toCutoffClause(cutoff)}`,
						tooltipLines: [...MONTHLY_BUDGET_CUTOFF_COPY[cutoff.kind].tooltipLines],
					}))
					return (
						<MeterMarker
							key={markerCutoffs[0]?.kind}
							percent={percent}
							label={`${percent}%`}
							ariaLabel={cutoffDetails.map((cutoffDetail) => cutoffDetail.heading).join(". ")}
							isPassed={isCutoffMarkerPassed}
							isMoving={isCutoffMarkerMoving}
							cutoffDetails={cutoffDetails}
						/>
					)
				})}
			</MeterBar>

			{/* the key to each budget percent segment. the podcast episode entry shows only if there is podcast episode
			    spend */}
			<Legend>
				{legendSegments.map(({ key, colorClass, label, cents }) => (
					<LegendItem key={key} colorClass={colorClass}>{`${label} ${toCentsLabel(cents)}`}</LegendItem>
				))}
			</Legend>

			{/* the budget percent and the status line, with the upgrade link once the budget is spent */}
			<StatusLine>
				<StatusPercent>{`${budgetUsedPercent}%`}</StatusPercent>{" "}
				{toSpendMeterStatusLine({ budgetUsedShare, monthlyBudgetCutoffs })}
				{isUpgradeVisible && upgradeLink && <> {upgradeLink}</>}
			</StatusLine>

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
		</Root>
	)
}
