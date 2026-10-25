// the source footnotes chart: what each Source read and kept in one scan, as plain HTML bars on Nightshift tokens

import { toFallbackModeLabel } from "@carlnotes/contracts/sources"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { SourceResult } from "@carlnotes/contracts/topics"
import { toCountLabel, toExactDollarLabel, toExactDurationLabel, toMonthDayLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { Trash2 } from "lucide-react"
import type * as React from "react"
import { useId, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { RECAP_HEADING_CLASS } from "@/lib/styleClasses"
import { IconButton } from "./IconButton"
import { TooltipSection } from "./UpdateCountBadge"

// the id of the row for the findings from earlier scans, always the last row
export const EARLIER_ROW_ID = "earlier"

// the narrowest kept fill, so one kept finding never reads as a sliver
const MIN_KEPT_FILL_WIDTH = "6px"

// what the earlier row's detail line says
const EARLIER_ROW_DETAIL =
	"Findings already on this topic that Carl re-read this brew and kept. No source returned them this time."

// the rows' three columns: the label, the bar, and the count. the list reaches past the rows' padding to line each
// row's text up with the heading
const ROW_LIST_CLASS = "-mx-2 grid grid-cols-[minmax(0,9rem)_minmax(3rem,1fr)_auto] gap-x-3 gap-y-0.5"

// a row's button across the three columns, with the row highlight on hover
const ROW_BUTTON_CLASS =
	"hover:bg-accent focus-visible:ring-ring/50 relative col-span-full grid grid-cols-subgrid items-center rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2"

// the trash button at the end of a removable row's detail line, red on hover
const REMOVE_SOURCE_BUTTON_CLASS =
	"text-muted-foreground hover:text-destructive grid h-11 w-7 shrink-0 place-items-center sm:size-7"

// the Sources an open row offers to remove, and what a tap on a trash button does
export type SourceRemoval = {
	removableSourceIds: ReadonlySet<string>
	onRemoveSource: (sourceId: string, label: string) => void
}

/**
 * The source footnotes chart: the heading with the scan's date, the summary line with its hint and legend, and one bar
 * row per Source that opens its detail line. With sourceRemoval, an open row of a removable Source offers to remove it.
 * It renders nothing with no row to show.
 */
export function SourceResultsChart({
	sourceResults,
	scannedAt,
	earlierKeptCount,
	earlierFoundCount,
	initialOpenRowId = null,
	sourceRemoval,
}: {
	sourceResults: SourceResult[]
	// when the scan finished, or started if it is still running
	scannedAt: string
	// the findings from earlier scans that no Source returned this scan, as Carl kept them and read them again
	earlierKeptCount: number
	earlierFoundCount: number
	// the row open on the first render, for a server render and a story
	initialOpenRowId?: string | null
	sourceRemoval?: SourceRemoval
}) {
	// the one open row, and the prefix of each row's detail line id
	const [openRowId, setOpenRowId] = useState<string | null>(initialOpenRowId)
	const detailIdPrefix = useId()

	// the Source rows in order, and the read count that spans the whole track
	const rows = toSourceResultRows(sourceResults)
	const maxFoundCount = Math.max(0, ...rows.map((row) => row.foundCount))

	// with no Source row and no earlier row there is nothing to chart
	const hasEarlierRow = earlierKeptCount > 0 || earlierFoundCount > 0
	if (rows.length === 0 && !hasEarlierRow) {
		return null
	}

	// open a tapped row, or close it if it was already open
	function handleToggleRow(tappedRowId: string): void {
		setOpenRowId((openRowId) => (openRowId === tappedRowId ? null : tappedRowId))
	}

	return (
		<section className="mt-4">
			{/* the heading on the left and the scan's date on the right */}
			<div className="flex items-baseline justify-between gap-3">
				<h3 className={RECAP_HEADING_CLASS}>Source footnotes</h3>
				<span className="text-muted-foreground text-xs">{toMonthDayLabel(scannedAt)}</span>
			</div>
			{/* the summary line with its tap hint, and the legend at the right end of its first line. the line wraps under
			    the legend */}
			<p className="text-muted-foreground mt-0.5 text-xs">
				<SourceResultsLegend />
				{toSourceResultsLine({ rows, earlierKeptCount, earlierFoundCount })} Tap a source for details.
			</p>
			{/* one row per Source, then the row for the findings from earlier scans */}
			<ul className={cn(ROW_LIST_CLASS, "mt-2")}>
				{rows.map((row) => (
					<SourceResultRow
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
				{hasEarlierRow && (
					<ChartRow
						label="Earlier brew findings"
						tooltipLines={[`read ${earlierFoundCount}`, `kept ${earlierKeptCount}`, EARLIER_ROW_DETAIL]}
						screenReaderLabel={`Earlier brew findings, ${earlierKeptCount} kept of ${earlierFoundCount} read`}
						bar={<SourceResultBar foundCount={0} keptCount={0} maxFoundCount={maxFoundCount} />}
						countLabel={String(earlierKeptCount)}
						isOpen={openRowId === EARLIER_ROW_ID}
						detailId={`${detailIdPrefix}-${EARLIER_ROW_ID}`}
						detail={<p>{EARLIER_ROW_DETAIL}</p>}
						onToggle={() => handleToggleRow(EARLIER_ROW_ID)}
					/>
				)}
			</ul>
		</section>
	)
}

/**
 * Returns the rows a chart shows: every Source that ran or failed, by kept and then read, both descending. A failed
 * Source follows a Source that ran with the same counts, and the label breaks any tie left.
 */
export function toSourceResultRows(sourceResults: readonly SourceResult[]): SourceResult[] {
	// sort by kept, then read, then a failed Source last, then by label
	return [...sourceResults].sort(
		(first, second) =>
			second.keptCount - first.keptCount ||
			second.foundCount - first.foundCount ||
			Number(first.status === "failed") - Number(second.status === "failed") ||
			first.label.localeCompare(second.label),
	)
}

/**
 * Returns the chart's summary line: the rows' kept and read counts with the findings from earlier scans in each, and
 * how many Sources the rows show.
 */
export function toSourceResultsLine({
	rows,
	earlierKeptCount,
	earlierFoundCount,
}: {
	rows: readonly SourceResult[]
	earlierKeptCount: number
	earlierFoundCount: number
}): string {
	// sum the rows' kept and read counts, with the findings from earlier scans in both
	const keptCount = rows.reduce((sum, row) => sum + row.keptCount, earlierKeptCount)
	const foundCount = rows.reduce((sum, row) => sum + row.foundCount, earlierFoundCount)
	return `${keptCount} kept from ${foundCount} read across ${toCountLabel(rows.length, "source")}.`
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

/**
 * Returns a Source row's tooltip lines: its counts, its cost if the api sent one, its time, and its status if it fell
 * back or failed.
 */
export function toSourceResultTooltipLines(row: SourceResult): string[] {
	const statusLine = toSourceResultStatusLine(row)
	return statusLine ? [...toSourceResultDetailParts(row), statusLine] : toSourceResultDetailParts(row)
}

// a Source row's counts, its cost if the api sent one, and its time
function toSourceResultDetailParts(row: SourceResult): string[] {
	const costPart = row.costDollars === null ? [] : [`cost ${toExactDollarLabel(row.costDollars)}`]
	return [
		`read ${row.foundCount}`,
		`kept ${row.keptCount}`,
		...costPart,
		`time ${toExactDurationLabel(row.durationMs)}`,
	]
}

// the status line of a Source that fell back or failed, and none for a Source that ran its primary path
function toSourceResultStatusLine(row: SourceResult): string | null {
	if (row.status === "fallback") {
		return `Fell back to ${toFallbackModeLabel(row.fallbackMode)}`
	}
	if (row.status === "failed") {
		return row.reason ? `Failed: ${row.reason}` : "Failed"
	}
	return null
}

// a count's share of the track as a css percentage
function toTrackPercent(count: number, maxFoundCount: number): string {
	return `${(count / maxFoundCount) * 100}%`
}
