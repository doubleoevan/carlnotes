// the source footnotes chart: what each Source read and kept in one scan, as plain HTML bars on Nightshift tokens

import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { SourceResult } from "@carlnotes/contracts/topics"
import {
	SourceResultsChart as SharedSourceResultsChart,
	type SourceResultsChartComponents,
	type SourceResultsChartProps,
} from "@carlnotes/core/components/SourceResultsChart"
import {
	toSourceResultDetailParts,
	toSourceResultStatusLine,
	toSourceResultTooltipLines,
} from "@carlnotes/core/lib/sourceResults"
import { cn } from "@carlnotes/nightshift/classNames"
import { Trash2 } from "lucide-react"
import type * as React from "react"

export type { SourceRemoval } from "@carlnotes/core/components/SourceResultsChart"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { RECAP_HEADING_CLASS } from "@/lib/styleClasses"
import { IconButton } from "./IconButton"
import { TooltipSection } from "./UpdateCountBadge"

// the narrowest kept fill, so one kept finding never reads as a sliver
const MIN_KEPT_FILL_WIDTH = "6px"

// the rows' three columns: the label, the bar, and the count. the list reaches past the rows' padding to line each
// row's text up with the heading
const ROW_LIST_CLASS = "-mx-2 grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto] gap-x-3 gap-y-0.5"

// a row's button across the three columns, with the row highlight on hover
const ROW_BUTTON_CLASS =
	"hover:bg-accent focus-visible:ring-ring/50 relative col-span-full grid grid-cols-subgrid items-center rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2"

// the trash button at the end of a removable row's detail line, red on hover
const REMOVE_SOURCE_BUTTON_CLASS =
	"text-muted-foreground hover:text-destructive grid h-11 w-7 shrink-0 place-items-center sm:size-7"

/**
 * Renders the shared Source chart with browser grid rows and tooltips.
 */
export function SourceResultsChart(props: SourceResultsChartProps) {
	return <SharedSourceResultsChart {...props} components={SOURCE_RESULTS_COMPONENTS} />
}

// browser elements preserve the chart's subgrid, semantic list, and hover details
const SOURCE_RESULTS_COMPONENTS: SourceResultsChartComponents = {
	Frame: ({ heading, dateLabel, summary, children }) => (
		<section className="mt-4">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className={RECAP_HEADING_CLASS}>{heading}</h3>
				<span className="text-muted-foreground text-xs">{dateLabel}</span>
			</div>
			<p className="text-muted-foreground mt-0.5 text-xs">
				<SourceResultsLegend />
				{summary}
			</p>
			<ul className={cn(ROW_LIST_CLASS, "mt-2")}>{children}</ul>
		</section>
	),
	Row: SourceResultRow,
	EarlierRow: ({ detail, maxFoundCount, ...props }) => (
		<ChartRow
			{...props}
			bar={<SourceResultBar foundCount={0} keptCount={0} maxFoundCount={maxFoundCount} />}
			detail={<p>{detail}</p>}
		/>
	),
}

// the legend at the right end of the summary line, with a swatch matching each bar fill. it is hidden from a screen
// reader, as the bars are
function SourceResultsLegend() {
	return (
		<span aria-hidden="true" className="float-right ml-3 inline-flex items-center gap-3">
			<span className="inline-flex items-center gap-1">
				<span className="bg-primary size-2.5 rounded-[2px]" />
				kept
			</span>
			<span className="inline-flex items-center gap-1">
				<span className="bg-separator-strong size-2.5 rounded-[2px]" />
				read
			</span>
		</span>
	)
}

// one Source's row: its bar and kept over read, or failed on an empty track, and its detail line while open
function SourceResultRow({
	row,
	maxFoundCount,
	isOpen,
	detailId,
	onToggle,
	onRemoveSource,
}: {
	row: SourceResult
	maxFoundCount: number
	isOpen: boolean
	detailId: string
	onToggle: () => void
	// what the trash button does, for a removable Source only
	onRemoveSource?: (sourceId: string, label: string) => void
}) {
	// a failed Source shows failed on an empty track, and every other Source its bar and kept over read
	const isFailed = row.status === "failed"
	return (
		<ChartRow
			label={row.label}
			tooltipLines={toSourceResultTooltipLines(row)}
			screenReaderLabel={
				isFailed ? `${row.label}, failed` : `${row.label}, ${row.keptCount} kept of ${row.foundCount} read`
			}
			bar={
				<SourceResultBar
					foundCount={isFailed ? 0 : row.foundCount}
					keptCount={isFailed ? 0 : row.keptCount}
					maxFoundCount={maxFoundCount}
				/>
			}
			countLabel={isFailed ? <span className="text-destructive">failed</span> : `${row.keptCount} / ${row.foundCount}`}
			isOpen={isOpen}
			detailId={detailId}
			detail={<SourceResultDetail row={row} onRemoveSource={onRemoveSource} />}
			onToggle={onToggle}
		/>
	)
}

// one row: a button with the truncated label, the bar, and the count, and a tooltip with the full label over the row's
// details, then the detail line under it while open
function ChartRow({
	label,
	tooltipLines,
	screenReaderLabel,
	bar,
	countLabel,
	isOpen,
	detailId,
	detail,
	onToggle,
}: {
	label: string
	// the bulleted lines under the full label in the row's tooltip
	tooltipLines: string[]
	// what a screen reader reads for the button
	screenReaderLabel: string
	bar: React.ReactNode
	countLabel: React.ReactNode
	isOpen: boolean
	detailId: string
	detail: React.ReactNode
	onToggle: () => void
}) {
	return (
		<li className="col-span-full grid grid-cols-subgrid">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-expanded={isOpen}
						aria-controls={detailId}
						onClick={onToggle}
						className={cn(ROW_BUTTON_CLASS, isOpen && "bg-accent")}
					>
						<span className="sr-only">{screenReaderLabel}</span>
						{/* the label in the link color, so the row reads as something to tap */}
						<span aria-hidden="true" className="text-link truncate">
							{label}
						</span>
						{bar}
						<span aria-hidden="true" className="text-right tabular-nums">
							{countLabel}
						</span>
					</button>
				</TooltipTrigger>
				{/* the full label in bold over every detail the row opens to */}
				<TooltipContent>
					<TooltipSection
						heading={label}
						tooltipLines={tooltipLines.map((tooltipLine) => ({ key: tooltipLine, line: tooltipLine }))}
						listedLineCount={tooltipLines.length}
					/>
				</TooltipContent>
			</Tooltip>
			{/* the detail line on the plain popover, under the row's highlight */}
			{isOpen && (
				<div
					id={detailId}
					className="text-muted-foreground col-span-full flex items-center gap-2 px-2 pt-1 pb-2 text-xs"
				>
					{detail}
				</div>
			)}
		</li>
	)
}

// a row's bar: the track, the read bar on the chart's scale, and the kept fill from the same left edge
function SourceResultBar({
	foundCount,
	keptCount,
	maxFoundCount,
}: {
	foundCount: number
	keptCount: number
	maxFoundCount: number
}) {
	// a row that read nothing, or a chart where no row read anything, draws only the track
	const isReadBarDrawn = foundCount > 0 && maxFoundCount > 0
	const isKeptFillDrawn = isReadBarDrawn && keptCount > 0
	return (
		<span aria-hidden="true" className="bg-muted relative h-2 overflow-hidden rounded-full">
			{isReadBarDrawn && (
				<span
					className="bg-separator-strong absolute inset-y-0 left-0 rounded-full"
					style={{ width: toTrackPercent(foundCount, maxFoundCount) }}
				/>
			)}
			{isKeptFillDrawn && (
				<span
					className="bg-primary absolute inset-y-0 left-0 rounded-full"
					style={{ width: `max(${MIN_KEPT_FILL_WIDTH}, ${toTrackPercent(keptCount, maxFoundCount)})` }}
				/>
			)}
		</span>
	)
}

// a Source's detail line: the full label, then read, kept, cost, and time, then a fallback or failure on its
// own line, and the trash button at the end for a removable Source
function SourceResultDetail({
	row,
	onRemoveSource,
}: {
	row: SourceResult
	onRemoveSource?: (sourceId: string, label: string) => void
}) {
	// the counts, the cost, and the time on one line, and the status under them
	const detailParts = toSourceResultDetailParts(row)
	const statusLine = toSourceResultStatusLine(row)
	return (
		<>
			<p className="min-w-0 flex-1 wrap-anywhere">
				<span className="text-foreground mr-2 font-semibold">{row.label}</span>
				{toDotSeparatedText(detailParts)}
				{statusLine && <span className="block">{statusLine}</span>}
			</p>
			{onRemoveSource && (
				<IconButton
					tooltip="Remove source"
					className={REMOVE_SOURCE_BUTTON_CLASS}
					onClick={() => onRemoveSource(row.sourceId, row.label)}
				>
					<Trash2 className="size-4" />
				</IconButton>
			)}
		</>
	)
}

// a count's share of the track as a css percentage
function toTrackPercent(count: number, maxFoundCount: number): string {
	return `${(count / maxFoundCount) * 100}%`
}
