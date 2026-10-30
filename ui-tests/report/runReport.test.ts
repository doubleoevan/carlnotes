// the run's summary and annotations over fixture reports: the selection, the counts, the failures, the image captures
// waiting for approval, the accessibility table and the image captures with no result, the jobs without a report, the
// baselines' size, the annotation limit, and HTML escaping
import { expect, test } from "bun:test"
import type { PlatformReport } from "../imageCaptures"
import { toWebReportEntry } from "../reportTestFixtures"
import type { ImageCaptureSelection } from "../selection/imageCaptureSelection"
import { toReportPageHtml } from "./reportPage"
import { toRunAnnotations, toRunSummary } from "./runReport"

// a web report with a pass, a change, an error, a new image capture, and a contrast violation
const WEB_REPORT: PlatformReport = {
	platform: "web",
	environmentId: "image",
	baselineEnvironmentId: "image",
	skippedStoryIds: ["chat-chatmarkdown--streaming"],
	reportEntries: [
		toWebReportEntry("passed", { status: "passed" }),
		toWebReportEntry("changed", {
			status: "changed",
			differingPixelCount: 12,
			differingPixelRatio: 0.0125,
			baselineSize: { width: 375, height: 100 },
			currentSize: { width: 375, height: 100 },
		}),
		toWebReportEntry("broken", { status: "error", errorText: "the play function threw: no menu\nstack" }),
		toWebReportEntry("new", {
			status: "new",
			accessibilityResult: {
				status: "checked",
				violations: [
					{
						ruleId: "color-contrast",
						help: "Elements must meet minimum color contrast ratio thresholds",
						nodeCount: 3,
						nodeSelectors: ["p.faint"],
					},
				],
			},
		}),
	],
}

// a selection that chose the stories that a component change reached, and nothing native
const SELECTION: ImageCaptureSelection = {
	baseCommit: "green",
	headCommit: "head",
	mode: "affected",
	reasons: ["`apps/web/src/components/common/Card.tsx` changed"],
	changedFiles: ["apps/web/src/components/common/Card.tsx"],
	platforms: {
		web: { mode: "affected", reasons: [], storyIds: ["common-card--default"], storyCount: 456 },
		mcp: { mode: "none", reasons: [], storyIds: [], storyCount: 0 },
		native: { mode: "none", reasons: [], storyIds: [], storyCount: 349 },
	},
}

// the summary counts every status, lists the failures and the waiting image captures, and says why a job was skipped
test("the summary states every result", () => {
	const runSummary = toRunSummary({
		selection: SELECTION,
		platformReports: [WEB_REPORT],
		jobResults: { web: "failure", android: "skipped" },
		baselineFolderSize: { imageCount: 2, byteCount: 300_000 },
		runUrl: "https://github.com/doubleoevan/carlnotes/actions/runs/1",
	})
	// the selection, the counts, and the failures, each with its detail
	expect(runSummary).toContain("### Selection: affected")
	expect(runSummary).toContain("| web | affected | 1 of 456 |")
	expect(runSummary).toContain("| web | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 1 |")
	expect(runSummary).toContain("### Failures (2)")
	expect(runSummary).toContain("1.25% of pixels differ, 375×100 to 375×100")
	expect(runSummary).toContain("the play function threw: no menu |")

	// the waiting image captures, the accessibility violations, the skipped job, and the artifacts
	expect(runSummary).toContain("### Waiting for approval (1)")
	expect(runSummary).toContain("| `color-contrast` | 1 | 3 | web new latte phone |")
	expect(runSummary).toContain("- **android:** skipped because the selection chose nothing for native")
	expect(runSummary).not.toContain("- **web:**")
	expect(runSummary).toContain("`ui-tests/baselines/` holds 2 images, 0.3 MB in Git LFS.")
	expect(runSummary).toContain("(https://github.com/doubleoevan/carlnotes/actions/runs/1#artifacts)")
})

// a run that captured nothing says so, names the job that failed before its report, and says no baseline is approved
test("a run with no reports names the job that failed before its report", () => {
	const runSummary = toRunSummary({
		selection: null,
		platformReports: [],
		jobResults: { select: "success", web: "failure" },
		baselineFolderSize: null,
		runUrl: null,
	})
	expect(runSummary).toContain("No selection was recorded for this run.")
	expect(runSummary).toContain("No platform was captured in this run.")
	expect(runSummary).toContain("- **web:** failed without a report. Its log names the step that stopped it")
	expect(runSummary).not.toContain("- **select:**")
	expect(runSummary).toContain("No baseline is approved yet.")
})

// an image capture whose accessibility result never arrived is named as not checked, never counted as passing
test("an image capture with no accessibility result is reported as not checked", () => {
	const unavailableEntry = toWebReportEntry("unread", {
		status: "new",
		accessibilityResult: { status: "not-available" },
	})
	const runSummary = toRunSummary({
		selection: null,
		platformReports: [{ ...WEB_REPORT, reportEntries: [unavailableEntry] }],
		jobResults: {},
		baselineFolderSize: null,
		runUrl: null,
	})
	expect(runSummary).toContain("1 image capture has no accessibility result, starting with web unread latte phone.")
})

// each failure is an error annotation and each waiting image capture a warning, ten of each per platform at most
test("annotations are limited per platform", () => {
	const manyChanges = Array.from({ length: 14 }, (_, i) =>
		toWebReportEntry(`changed-${i}`, {
			status: "changed",
			differingPixelCount: 1,
			differingPixelRatio: 0.01,
			baselineSize: { width: 1, height: 1 },
			currentSize: { width: 1, height: 1 },
		}),
	)
	const runAnnotations = toRunAnnotations([
		{ ...WEB_REPORT, reportEntries: [...manyChanges, toWebReportEntry("new", { status: "new" })] },
	])
	expect(runAnnotations.filter((annotation) => annotation.startsWith("::error"))).toHaveLength(10)
	expect(runAnnotations.filter((annotation) => annotation.startsWith("::warning"))).toEqual([
		"::warning title=UI test waiting for approval::web new latte phone new.",
	])
})

// a passed image capture starts hidden, and keeps its image for when its filter is turned on
test("the report page keeps a passed image capture's image", () => {
	const currentPath = "current/web/passed/latte-phone.png"
	const passedEntry = toWebReportEntry("passed", { status: "passed", imagePaths: { currentPath } })
	const reportPageHtml = toReportPageHtml([{ ...WEB_REPORT, reportEntries: [passedEntry] }], "UI tests")
	expect(reportPageHtml).toContain('<article data-status="passed" data-failing="false" hidden>')
	expect(reportPageHtml).toContain(`src="${currentPath}"`)
})

// text that a story raised never becomes markup on the report page
test("the report page escapes text", () => {
	const errorText = `<img src=x onerror="alert('1')">`
	const errorEntry = toWebReportEntry("broken", { status: "error", errorText })
	const reportPageHtml = toReportPageHtml([{ ...WEB_REPORT, reportEntries: [errorEntry] }], "UI tests")
	expect(reportPageHtml).not.toContain("<img src=x")
	expect(reportPageHtml).toContain(Bun.escapeHTML(errorText))
})
