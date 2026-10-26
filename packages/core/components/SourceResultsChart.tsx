import type { SourceResult } from "@carlnotes/contracts/topics"
import { type ComponentType, type ReactNode, useId, useState } from "react"
import { toMonthDayLabel } from "../lib/labels"
import { EARLIER_ROW_DETAIL, EARLIER_ROW_ID, toSourceResultRows, toSourceResultsLine } from "../lib/sourceResults"

// the same removable Sources and chart inputs on both platforms
export type SourceRemoval = {
	removableSourceIds: ReadonlySet<string>
	onRemoveSource: (sourceId: string, label: string) => void
}
export type SourceResultsChartProps = {
	sourceResults: SourceResult[]
	scannedAt: string
	earlierKeptCount: number
	earlierFoundCount: number
	initialOpenRowId?: string | null
	sourceRemoval?: SourceRemoval
}
export type SourceResultRowProps = {
	row: SourceResult
	maxFoundCount: number
	isOpen: boolean
	detailId: string
	onToggle: () => void
	onRemoveSource?: SourceRemoval["onRemoveSource"]
}
export type EarlierSourceResultRowProps = {
	label: string
	countLabel: string
	screenReaderLabel: string
	tooltipLines: string[]
	detail: string
	maxFoundCount: number
	isOpen: boolean
	detailId: string
	onToggle: () => void
}
export type SourceResultsChartComponents = {
	Frame: ComponentType<{ heading: string; dateLabel: string; summary: string; children: ReactNode }>
	Row: ComponentType<SourceResultRowProps>
	EarlierRow: ComponentType<EarlierSourceResultRowProps>
}

/**
 * Renders the chart's ordered Sources, expansion state, and earlier Findings through platform row adapters.
 */
export function SourceResultsChart({
	sourceResults,
	scannedAt,
	earlierKeptCount,
	earlierFoundCount,
	initialOpenRowId = null,
	sourceRemoval,
	components: { Frame, Row, EarlierRow },
}: SourceResultsChartProps & { components: SourceResultsChartComponents }) {
	// keep one detail row open and give it a stable accessible identity
	const [openRowId, setOpenRowId] = useState<string | null>(initialOpenRowId)
	const detailIdPrefix = useId()
	const rows = toSourceResultRows(sourceResults)
	const maxFoundCount = Math.max(0, ...rows.map((row) => row.foundCount))
	const hasEarlierRow = earlierKeptCount > 0 || earlierFoundCount > 0
	if (rows.length === 0 && !hasEarlierRow) {
		return null
	}
	const handleToggleRow = (rowId: string): void => setOpenRowId((openId) => (openId === rowId ? null : rowId))
	return (
		<Frame
			heading="Source footnotes"
			dateLabel={toMonthDayLabel(scannedAt)}
			summary={`${toSourceResultsLine({ rows, earlierKeptCount, earlierFoundCount })} Tap a source for details.`}
		>
			{/* all source rows share ordering, expansion, and removal gates */}
			{rows.map((row) => (
				<Row
					key={row.sourceId}
					row={row}
					maxFoundCount={maxFoundCount}
					isOpen={openRowId === row.sourceId}
					detailId={`${detailIdPrefix}-${row.sourceId}`}
					onToggle={() => handleToggleRow(row.sourceId)}
					onRemoveSource={
						sourceRemoval?.removableSourceIds.has(row.sourceId) ? sourceRemoval.onRemoveSource : undefined
					}
				/>
			))}
			{/* earlier Findings have their own explanation and no removal action */}
			{hasEarlierRow && (
				<EarlierRow
					label="Earlier brew findings"
					countLabel={String(earlierKeptCount)}
					screenReaderLabel={`Earlier brew findings, ${earlierKeptCount} kept of ${earlierFoundCount} read`}
					tooltipLines={[`read ${earlierFoundCount}`, `kept ${earlierKeptCount}`, EARLIER_ROW_DETAIL]}
					detail={EARLIER_ROW_DETAIL}
					maxFoundCount={maxFoundCount}
					isOpen={openRowId === EARLIER_ROW_ID}
					detailId={`${detailIdPrefix}-${EARLIER_ROW_ID}`}
					onToggle={() => handleToggleRow(EARLIER_ROW_ID)}
				/>
			)}
		</Frame>
	)
}
