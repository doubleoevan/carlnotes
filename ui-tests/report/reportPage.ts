// the run's report page: one self-contained HTML file beside the images, with a filter by status and, for each image
// capture that did not pass, its baseline, current, diff, and retake images side by side
import { readFileSync } from "node:fs"
import {
	FAILING_STATUSES,
	type PlatformReport,
	type ReportEntry,
	type ReportStatus,
	toImageCaptureLabel,
} from "../imageCaptures"
import { toEntryDetail } from "./runReport"

// the order that the page lists statuses in: failures first, then the image captures waiting for approval, then the
// rest
const STATUS_ORDER: ReportStatus[] = ["changed", "error", "unstable", "new", "removed", "skipped", "passed"]

// the statuses whose entries start hidden
const HIDDEN_STATUSES: ReadonlySet<ReportStatus> = new Set(["passed", "skipped"])

// the page's styles, light and dark
const REPORT_PAGE_STYLE = readFileSync(new URL("./reportPage.css", import.meta.url), "utf8")

// the script that hides the entries whose status is unchecked
const REPORT_PAGE_SCRIPT = [
	'for (const checkbox of document.querySelectorAll("input[data-status]")) {',
	'\tcheckbox.addEventListener("change", () => {',
	'\t\tfor (const entry of document.querySelectorAll("article")) {',
	"\t\t\tif (entry.dataset.status === checkbox.dataset.status) entry.hidden = !checkbox.checked",
	"\t\t}",
	"\t})",
	"}",
].join("\n")

/**
 * Returns the report page's HTML: a filter by status, and every entry with its images, failures first.
 */
export function toReportPageHtml(platformReports: PlatformReport[], title: string): string {
	// every entry in status order, and the count of each status
	const reportEntries = platformReports
		.flatMap((platformReport) => platformReport.reportEntries)
		.sort(
			(firstEntry, secondEntry) => STATUS_ORDER.indexOf(firstEntry.status) - STATUS_ORDER.indexOf(secondEntry.status),
		)
	const reportEntriesByStatus = Map.groupBy(reportEntries, (reportEntry) => reportEntry.status)

	// a checkbox per status that the run has, checked unless its entries start hidden
	const statusCheckboxes = STATUS_ORDER.filter((status) => reportEntriesByStatus.has(status)).map((status) => {
		const checkedAttribute = HIDDEN_STATUSES.has(status) ? "" : " checked"
		const statusCount = reportEntriesByStatus.get(status)?.length ?? 0
		return `<label><input type="checkbox" data-status="${status}"${checkedAttribute}> ${status} (${statusCount})</label>`
	})

	// the page
	return [
		"<!doctype html>",
		'<html lang="en">',
		'<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
		`<title>${Bun.escapeHTML(title)}</title><style>${REPORT_PAGE_STYLE}</style></head>`,
		`<body><h1>${Bun.escapeHTML(title)}</h1>`,
		`<fieldset><legend>Show</legend>${statusCheckboxes.join("")}</fieldset>`,
		...reportEntries.map(toEntryHtml),
		`<script>${REPORT_PAGE_SCRIPT}</script>`,
		"</body></html>",
		"",
	].join("\n")
}

// one entry: its label, status, detail, blocked requests, and images, hidden at first if it passed or was skipped
function toEntryHtml(reportEntry: ReportEntry): string {
	// the images that an entry names, each with its caption. an entry that starts hidden keeps them too, for when its
	// filter is turned on, and its lazy images load only once it shows
	const isHidden = HIDDEN_STATUSES.has(reportEntry.status)
	const captionedImagePaths: [string, string | undefined][] = [
		["baseline", reportEntry.imagePaths.baselinePath],
		["current", reportEntry.imagePaths.currentPath],
		["diff", reportEntry.imagePaths.diffPath],
		["retake", reportEntry.imagePaths.retakePath],
	]
	const imageFigures = captionedImagePaths.flatMap(([caption, imagePath]) =>
		imagePath ? [toFigureHtml(caption, imagePath)] : [],
	)

	// the entry's heading, its detail with any blocked requests, its accessibility violations, and its images
	const blockedText = reportEntry.blockedUrls.length > 0 ? ` Blocked: ${reportEntry.blockedUrls.join(", ")}` : ""
	return [
		`<article data-status="${reportEntry.status}" data-failing="${FAILING_STATUSES.has(reportEntry.status)}"${isHidden ? " hidden" : ""}>`,
		`<h2>${Bun.escapeHTML(toImageCaptureLabel(reportEntry))}: ${reportEntry.status}</h2>`,
		`<p>${Bun.escapeHTML(`${toEntryDetail(reportEntry)}${blockedText}`)}</p>`,
		...toViolationLines(reportEntry).map((violationLine) => `<p>${Bun.escapeHTML(violationLine)}</p>`),
		`<div class="images">${imageFigures.join("")}</div>`,
		"</article>",
	].join("\n")
}

// an image capture's accessibility lines: one per violation, or one saying the image capture has no result and is not
// checked
function toViolationLines(reportEntry: ReportEntry): string[] {
	// an entry with no image has no result, and an image capture that the addon never reported on is not checked
	if (!("accessibilityResult" in reportEntry)) {
		return []
	}
	if (reportEntry.accessibilityResult.status === "not-available") {
		return ["Accessibility: no result was available, so this image capture is not checked"]
	}

	// each violated rule, with its help text and the first elements that break it
	return reportEntry.accessibilityResult.violations.map(
		(violation) =>
			`Accessibility: ${violation.ruleId}, ${violation.help}, on ${violation.nodeCount} elements: ${violation.nodeSelectors.join(", ")}`,
	)
}

// one captioned image
function toFigureHtml(caption: string, imagePath: string): string {
	return `<figure><figcaption>${caption}</figcaption><img loading="lazy" src="${Bun.escapeHTML(imagePath)}" alt="${caption}"></figure>`
}
