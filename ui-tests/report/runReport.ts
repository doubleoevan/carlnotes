// a run's merged report: the selection, every platform's entries counted by status, the failures and the image captures
// waiting for approval, the accessibility violations, each job without a report with why, and the baselines' size, written
// as the run's summary and annotations
import {
	FAILING_STATUSES,
	type PlatformReport,
	type ReportEntry,
	type ReportStatus,
	toImageCaptureLabel,
	WAITING_STATUSES,
} from "../imageCaptures"
import type { ImageCaptureSelection, SelectionPlatform } from "../selection/imageCaptureSelection"
import { toSelectionSummary } from "../selection/selectionSummary"

/** A workflow job's result, as GitHub reports it to a later job. */
export type JobResult = "success" | "failure" | "cancelled" | "skipped"

/** How many approved images the repo holds, and their size on disk. */
export type BaselineFolderSize = { imageCount: number; byteCount: number }

/**
 * What a run's report is made from: the selection, each platform's report, each job's result, the approved baselines'
 * size, or null before any is approved, and the run's url.
 */
export type RunReportInput = {
	selection: ImageCaptureSelection | null
	platformReports: PlatformReport[]
	jobResults: Record<string, JobResult>
	baselineFolderSize: BaselineFolderSize | null
	runUrl: string | null
}

// the statuses in the order that the summary counts them
const REPORT_STATUSES: ReportStatus[] = ["passed", "changed", "new", "removed", "error", "unstable", "skipped"]

// the most rows that each summary table lists, and the most annotations of each kind per platform
const SUMMARY_ROW_LIMIT = 50
const ANNOTATION_LIMIT = 10

// the selection platform whose mode decides whether each capture job runs
const JOB_SELECTION_PLATFORMS: Record<string, SelectionPlatform> = {
	web: "web",
	mcp: "mcp",
	android: "native",
	ios: "native",
}

/**
 * Returns the run's summary in markdown: the selection, the counts by status, the failures, the image captures waiting
 * for approval, the accessibility violations, the jobs without a report, the baselines' size, and where the artifacts
 * are.
 */
export function toRunSummary(runReportInput: RunReportInput): string {
	const reportEntries = runReportInput.platformReports.flatMap((platformReport) => platformReport.reportEntries)
	return [
		"## UI tests",
		"",
		...toSelectionLines(runReportInput.selection),
		...toCountTable(runReportInput.platformReports),
		...toEnvironmentLines(runReportInput.platformReports),
		...toEntryTable(
			"Failures",
			reportEntries.filter((reportEntry) => FAILING_STATUSES.has(reportEntry.status)),
		),
		...toEntryTable(
			"Waiting for approval",
			reportEntries.filter((reportEntry) => WAITING_STATUSES.has(reportEntry.status)),
		),
		...toAccessibilityLines(reportEntries),
		...toUnreportedJobLines(runReportInput),
		...toBaselineSizeLines(runReportInput.baselineFolderSize),
		...toArtifactLines(runReportInput.runUrl),
	].join("\n")
}

/**
 * Returns the run's annotations as workflow commands: an error for each failure and a warning for each image capture
 * waiting for approval, up to the limit per platform.
 */
export function toRunAnnotations(platformReports: PlatformReport[]): string[] {
	return platformReports.flatMap((platformReport) => {
		// the failures and the waiting image captures, each limited
		const failingEntries = platformReport.reportEntries.filter((reportEntry) =>
			FAILING_STATUSES.has(reportEntry.status),
		)
		const waitingEntries = platformReport.reportEntries.filter((reportEntry) =>
			WAITING_STATUSES.has(reportEntry.status),
		)
		return [
			...failingEntries.slice(0, ANNOTATION_LIMIT).map((reportEntry) => toAnnotation("error", reportEntry)),
			...waitingEntries.slice(0, ANNOTATION_LIMIT).map((reportEntry) => toAnnotation("warning", reportEntry)),
		]
	})
}

/**
 * Returns a report entry's detail: the differing pixel ratio of a change, the text of an error, or the reason for a skip.
 */
export function toEntryDetail(reportEntry: ReportEntry): string {
	// a change's differing pixel ratio and both sizes
	if (reportEntry.status === "changed") {
		const { baselineSize, currentSize } = reportEntry
		const sizeText = `${baselineSize.width}×${baselineSize.height} to ${currentSize.width}×${currentSize.height}`
		return `${(reportEntry.differingPixelRatio * 100).toFixed(2)}% of pixels differ, ${sizeText}`
	}

	// an error's first line, a skip's reason, and nothing for the rest
	if (reportEntry.status === "error") {
		return reportEntry.errorText.split("\n")[0] ?? ""
	}
	return reportEntry.status === "skipped" ? reportEntry.skipReason : ""
}

// the selection's summary, or a note that the run recorded none
function toSelectionLines(selection: ImageCaptureSelection | null): string[] {
	return selection ? [toSelectionSummary(selection), ""] : ["No selection was recorded for this run.", ""]
}

// the table of each platform's counts by status
function toCountTable(platformReports: PlatformReport[]): string[] {
	// one row per platform, with a count per status
	const countRows = platformReports.map((platformReport) => {
		const statusCounts = REPORT_STATUSES.map(
			(status) => platformReport.reportEntries.filter((reportEntry) => reportEntry.status === status).length,
		)
		return `| ${platformReport.platform} | ${statusCounts.join(" | ")} | ${platformReport.skippedStoryIds.length} |`
	})

	// a run that captured nothing says so
	if (countRows.length === 0) {
		return ["No platform was captured in this run.", ""]
	}
	return [
		`| platform | ${REPORT_STATUSES.join(" | ")} | stories tagged no-screenshot |`,
		`|---|${REPORT_STATUSES.map(() => "---").join("|")}|---|`,
		...countRows,
		"",
	]
}

// a note for each platform whose image captures came from a different environment than its approved baselines
function toEnvironmentLines(platformReports: PlatformReport[]): string[] {
	return platformReports
		.filter((platformReport) => platformReport.baselineEnvironmentId !== null)
		.filter((platformReport) => platformReport.baselineEnvironmentId !== platformReport.environmentId)
		.flatMap((platformReport) => [
			`**${platformReport.platform}:** these image captures came from \`${platformReport.environmentId}\`, and the baselines were approved in \`${platformReport.baselineEnvironmentId}\`.`,
			"",
		])
}

// a titled table of report entries with each one's detail, limited with a count of the rest
function toEntryTable(title: string, reportEntries: ReportEntry[]): string[] {
	// a section with no entries is left out
	if (reportEntries.length === 0) {
		return []
	}

	// one row per entry, up to the limit
	const entryRows = reportEntries
		.slice(0, SUMMARY_ROW_LIMIT)
		.map(
			(reportEntry) =>
				`| ${reportEntry.platform} | \`${reportEntry.storyId}\` | ${reportEntry.paletteName} | ${reportEntry.sizeName} | ${reportEntry.status} | ${toTableText(toEntryDetail(reportEntry))} |`,
		)
	const hiddenRowCount = reportEntries.length - entryRows.length
	return [
		`### ${title} (${reportEntries.length})`,
		"",
		"| platform | story | palette | size | status | detail |",
		"|---|---|---|---|---|---|",
		...entryRows,
		...(hiddenRowCount > 0 ? ["", `and ${hiddenRowCount} more in the report artifact.`] : []),
		"",
	]
}

// the accessibility violations by rule, with the image captures that break each and their node count, and the image
// captures that have no accessibility result
function toAccessibilityLines(reportEntries: ReportEntry[]): string[] {
	// every violation, with the image capture that it was found in, and every image capture with no result
	const violations = reportEntries.flatMap((reportEntry) =>
		"accessibilityResult" in reportEntry && reportEntry.accessibilityResult.status === "checked"
			? reportEntry.accessibilityResult.violations.map((violation) => ({ ...violation, reportEntry }))
			: [],
	)
	const unavailableEntries = reportEntries.filter(
		(reportEntry) => "accessibilityResult" in reportEntry && reportEntry.accessibilityResult.status === "not-available",
	)
	if (violations.length === 0 && unavailableEntries.length === 0) {
		return []
	}

	// one row per rule, the most image captures first: the image capture count, the node count, and the first image
	// capture
	const violationsByRule = Map.groupBy(violations, (violation) => violation.ruleId)
	const ruleRows = [...violationsByRule]
		.sort(([, firstViolations], [, secondViolations]) => secondViolations.length - firstViolations.length)
		.map(([ruleId, ruleViolations]) => {
			const nodeCount = ruleViolations.reduce((total, violation) => total + violation.nodeCount, 0)
			const firstImageCaptureLabel = ruleViolations[0] ? toImageCaptureLabel(ruleViolations[0].reportEntry) : ""
			return `| \`${ruleId}\` | ${ruleViolations.length} | ${nodeCount} | ${firstImageCaptureLabel} |`
		})

	// the rule table, with its rows limited
	const ruleTableLines =
		ruleRows.length > 0
			? [
					"| rule | image captures | nodes | first image capture |",
					"|---|---|---|---|",
					...ruleRows.slice(0, SUMMARY_ROW_LIMIT),
					"",
				]
			: []

	// the image captures with no result, which are never counted as passing
	const firstUnavailableEntry = unavailableEntries[0]
	const unavailableCountText =
		unavailableEntries.length === 1 ? "1 image capture has" : `${unavailableEntries.length} image captures have`
	const unavailableText = firstUnavailableEntry
		? `${unavailableCountText} no accessibility result, starting with ${toImageCaptureLabel(firstUnavailableEntry)}. No such image capture counts as checked.`
		: null

	// the section
	return [
		`### Accessibility, report-only (${violationsByRule.size} rules)`,
		"",
		...ruleTableLines,
		...(unavailableText ? [unavailableText, ""] : []),
	]
}

// each job that wrote no report, with why. a job whose platform report the counts already show is left out
function toUnreportedJobLines(runReportInput: RunReportInput): string[] {
	const reportedJobNames = new Set<string>(
		runReportInput.platformReports.map((platformReport) => platformReport.platform),
	)
	const unreportedJobLines = Object.entries(runReportInput.jobResults)
		.filter(([jobName, jobResult]) => jobResult !== "success" && !reportedJobNames.has(jobName))
		.map(
			([jobName, jobResult]) =>
				`- **${jobName}:** ${toUnreportedJobReason(jobName, jobResult, runReportInput.selection)}`,
		)
	return unreportedJobLines.length > 0 ? ["### Jobs without a report", "", ...unreportedJobLines, ""] : []
}

// why a job wrote no report: cancelled, failed before its report, nothing selected for it, or an earlier job that it
// needs did not pass
function toUnreportedJobReason(jobName: string, jobResult: JobResult, selection: ImageCaptureSelection | null): string {
	// a cancelled job, and a job that failed before it wrote its report
	if (jobResult === "cancelled") {
		return "cancelled"
	}
	if (jobResult === "failure") {
		return "failed without a report. Its log names the step that stopped it"
	}

	// a skipped job, and whether the selection chose nothing for it
	const selectionPlatform = JOB_SELECTION_PLATFORMS[jobName]
	const isNothingSelected = selectionPlatform && selection?.platforms[selectionPlatform].mode === "none"
	return isNothingSelected ? `skipped because the selection chose nothing for ${selectionPlatform}` : "skipped"
}

// how many approved images the repo holds and their size in Git LFS, so the baselines' growth shows on every run
function toBaselineSizeLines(baselineFolderSize: BaselineFolderSize | null): string[] {
	const megabyteText = baselineFolderSize ? (baselineFolderSize.byteCount / 1_000_000).toFixed(1) : ""
	const sizeText = baselineFolderSize
		? `\`ui-tests/baselines/\` holds ${baselineFolderSize.imageCount} images, ${megabyteText} MB in Git LFS.`
		: "No baseline is approved yet."
	return ["### Baselines", "", sizeText, ""]
}

// where the run's artifacts are, with the report and the images
function toArtifactLines(runUrl: string | null): string[] {
	const artifactsLink = runUrl ? `[the run's artifacts](${runUrl}#artifacts)` : "the run's artifacts"
	return [
		"### Artifacts",
		"",
		`The \`visual-report\` artifact in ${artifactsLink} holds \`report.html\`, with every baseline, current, and diff image.`,
		"`bun run visual:open -- <run id>` downloads it and opens it.",
	]
}

// one annotation as a workflow command, naming the image capture and its detail
function toAnnotation(annotationLevel: "error" | "warning", reportEntry: ReportEntry): string {
	const titleText = annotationLevel === "error" ? `UI test ${reportEntry.status}` : "UI test waiting for approval"
	const messageText = `${toImageCaptureLabel(reportEntry)} ${reportEntry.status}. ${toEntryDetail(reportEntry)}`.trim()
	return `::${annotationLevel} title=${titleText}::${toWorkflowCommandText(messageText)}`
}

// text safe for one markdown table cell
function toTableText(text: string): string {
	return text.replaceAll("|", "\\|").replaceAll("\n", " ")
}

// text safe for a workflow command's message
function toWorkflowCommandText(text: string): string {
	return text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")
}
