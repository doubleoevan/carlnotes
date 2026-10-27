import type { ActivityScan } from "@carlnotes/contracts/activity"
import type { ReactNode } from "react"
import type { TableColumn } from "../components/DataTable"
import { durationMsBetween, toCentsLabel, toDateLabel } from "./labels"

// chronological and numeric sorting for Scan history on both platforms
export const scanSortValues = {
	date: (scan: ActivityScan) => new Date(scan.startedAt).getTime(),
	read: (scan: ActivityScan) => scan.foundCount,
	kept: (scan: ActivityScan) => scan.keptCount,
	time: (scan: ActivityScan) => durationMsBetween(scan.startedAt, scan.finishedAt),
	cost: (scan: ActivityScan) => scan.costCents,
}

/**
 * Builds Scan history's shared columns, formatting, and complete totals.
 */
export function toTopicScansTableColumns({
	scans,
	renderText,
	renderTime,
}: {
	scans: ActivityScan[]
	renderText: (text: string) => ReactNode
	renderTime: (scan: ActivityScan) => ReactNode
}): TableColumn<ActivityScan>[] {
	// total all loaded scans, including the ones on other pages
	const foundCount = scans.reduce((total, scan) => total + scan.foundCount, 0)
	const keptCount = scans.reduce((total, scan) => total + scan.keptCount, 0)
	const costCents = scans.reduce((total, scan) => total + scan.costCents, 0)
	return [
		{
			key: "date",
			label: "Date",
			width: 176,
			render: (scan) => renderText(toDateLabel(scan.startedAt)),
			footer: renderText("Total"),
		},
		{
			key: "read",
			label: "Read",
			width: 96,
			render: (scan) => renderText(String(scan.foundCount)),
			footer: renderText(`${foundCount} read`),
		},
		{
			key: "kept",
			label: "Kept",
			width: 96,
			render: (scan) => renderText(String(scan.keptCount)),
			footer: renderText(`${keptCount} kept`),
		},
		{
			key: "time",
			label: "Brew time",
			width: 128,
			tooltip: "How long each brew took. Click a time for Carl's notes",
			render: renderTime,
		},
		{
			key: "cost",
			label: "Cost",
			width: 112,
			render: (scan) => renderText(toCentsLabel(scan.costCents)),
			footer: renderText(toCentsLabel(costCents)),
		},
	]
}
