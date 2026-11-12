// the summary strip's counts on the app's details line
import { type DashboardSummary, toDashboardSummaryCounts } from "@carlnotes/contracts/dashboards"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { ComponentType } from "react"
import type { DetailsLineProps } from "./DetailsLine"

// each app's details line
export type DashboardSummaryStripElements = { DetailsLine: ComponentType<DetailsLineProps> }

/**
 * Shows a Dashboard's summary counts on one details line.
 */
export function DashboardSummaryStrip({
	summary,
	elements: { DetailsLine },
}: {
	summary: DashboardSummary
	elements: DashboardSummaryStripElements
}) {
	return <DetailsLine details={toDashboardSummaryCounts(summary).map(({ count, noun }) => toCountLabel(count, noun))} />
}
