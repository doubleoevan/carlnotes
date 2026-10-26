import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { ComponentType, ReactNode } from "react"
import { durationMsBetween, toDollarLabel, toDurationLabel } from "../lib/labels"
import { type ScanRecapFields, toScanRecapPlaceholder } from "../lib/topicScanRecap"
import type { SourceRemoval, SourceResultsChartProps } from "./SourceResultsChart"

// platform adapters render the same diary body inside their dialog or sheet
export type TopicScanRecapProps = {
	scan: ScanRecapFields
	allowedUrls?: ReadonlySet<string>
	findings?: TopicFinding[]
	copyMarkdown?: string
	sourceRemoval?: SourceRemoval
}
export type SafeNoteTextProps = { note: string; allowedUrls?: ReadonlySet<string> }
export type ScanRecapFooterProps = { duration: string | null; costLabel: string | null }
export type TopicScanRecapComponents = {
	ScrollBox: ComponentType<{ children: ReactNode; copyMarkdown?: string }>
	SafeNoteText: ComponentType<SafeNoteTextProps>
	FindingList: ComponentType<{ findings: TopicFinding[] }>
	SourceResultsChart: ComponentType<SourceResultsChartProps>
	Placeholder: ComponentType<{ children: ReactNode }>
	Footer: ComponentType<ScanRecapFooterProps>
}

/**
 * Renders the diary note, Findings, Source footnotes, and permitted duration and cost in their shared order.
 */
export function TopicScanRecap({
	scan,
	allowedUrls,
	findings,
	copyMarkdown,
	sourceRemoval,
	components: { ScrollBox, SafeNoteText, FindingList, SourceResultsChart, Placeholder, Footer },
}: TopicScanRecapProps & { components: TopicScanRecapComponents }) {
	// show final spend only when the scan has settled and the api supplied it
	const duration = toDurationLabel(durationMsBetween(scan.startedAt, scan.finishedAt))
	const costLabel = scan.status !== "running" && scan.costDollars !== null ? toDollarLabel(scan.costDollars) : null
	return (
		<>
			{/* bound the note and Findings together */}
			{scan.scanSummary ? (
				<ScrollBox copyMarkdown={copyMarkdown}>
					<SafeNoteText note={scan.scanSummary} allowedUrls={allowedUrls} />
					{findings && findings.length > 0 && <FindingList findings={findings} />}
				</ScrollBox>
			) : (
				<Placeholder>{toScanRecapPlaceholder(scan)}</Placeholder>
			)}
			{/* keep the chart outside the bounded note */}
			{scan.sourceResults && (
				<SourceResultsChart
					sourceResults={scan.sourceResults.sources}
					scannedAt={scan.finishedAt ?? scan.startedAt}
					earlierKeptCount={scan.sourceResults.earlierKeptCount}
					earlierFoundCount={scan.sourceResults.earlierFoundCount}
					sourceRemoval={sourceRemoval}
				/>
			)}
			{/* preserve the footer's visibility gates */}
			{(duration || costLabel !== null) && <Footer duration={duration} costLabel={costLabel} />}
		</>
	)
}
