import { toFallbackModeLabel } from "@carlnotes/contracts/sources"
import type { SourceResult } from "@carlnotes/contracts/topics"
import { toCountLabel, toExactDollarLabel, toExactDurationLabel } from "./labels"

// the shared identity and explanation for findings read again from earlier scans
export const EARLIER_ROW_ID = "earlier"
export const EARLIER_ROW_DETAIL =
	"Findings already on this topic that Carl re-read this brew and kept. No source returned them this time."

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

/**
 * Returns a Source row's tooltip lines: its counts, its cost if the api sent one, its time, and its status if it fell
 * back or failed.
 */
export function toSourceResultTooltipLines(row: SourceResult): string[] {
	const statusLine = toSourceResultStatusLine(row)
	return statusLine ? [...toSourceResultDetailParts(row), statusLine] : toSourceResultDetailParts(row)
}

/**
 * Returns a Source row's counts, visible cost, and elapsed time.
 */
export function toSourceResultDetailParts(row: SourceResult): string[] {
	const costPart = row.costDollars === null ? [] : [`cost ${toExactDollarLabel(row.costDollars)}`]
	return [
		`read ${row.foundCount}`,
		`kept ${row.keptCount}`,
		...costPart,
		`time ${toExactDurationLabel(row.durationMs)}`,
	]
}

/**
 * Returns the fallback or failure line shared by both Source charts.
 */
export function toSourceResultStatusLine(row: SourceResult): string | null {
	if (row.status === "fallback") {
		return `Fell back to ${toFallbackModeLabel(row.fallbackMode)}`
	}
	if (row.status === "failed") {
		return row.reason ? `Failed: ${row.reason}` : "Failed"
	}
	return null
}
