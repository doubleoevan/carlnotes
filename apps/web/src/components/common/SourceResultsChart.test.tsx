// the source footnotes chart's heading, row order, summary line, bars, detail line, and trash button, in server-rendered
// markup
import { expect, test } from "bun:test"
import type { SourceResult } from "@carlnotes/contracts/topics"
import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { RECAP_HEADING_CLASS } from "@/lib/styleClasses"
import { EARLIER_ROW_ID, SourceResultsChart, toSourceResultRows, toSourceResultsLine } from "./SourceResultsChart"

// a Source that ran its primary path with the given counts, labeled by its id, with any field replaced
function toOkResult({
	sourceId,
	foundCount,
	keptCount,
	...sourceResultFields
}: Pick<SourceResult, "sourceId" | "foundCount" | "keptCount"> & Partial<SourceResult>): SourceResult {
	return {
		sourceKind: "rss",
		label: sourceId,
		costDollars: 0.004,
		durationMs: 1_200,
		...sourceResultFields,
		sourceId,
		foundCount,
		keptCount,
		status: "ok",
	} as SourceResult
}

// a Source whose ingester threw, with the reason the owner sees, or null for anyone else
function toFailedResult(sourceId: string, reason: string | null): SourceResult {
	return {
		sourceId,
		sourceKind: "url",
		label: sourceId,
		status: "failed",
		reason,
		foundCount: 0,
		keptCount: 0,
		costDollars: 0,
		durationMs: 2_400,
	}
}

// a subreddit served by the keyless feed
const FALLBACK_RESULT: SourceResult = {
	sourceId: "reddit",
	sourceKind: "reddit",
	label: "r/startups",
	status: "fallback",
	fallbackMode: "reddit-rss",
	foundCount: 38,
	keptCount: 1,
	costDollars: 0,
	durationMs: 6_400,
}

// the scan's finish time every chart shows, at midday so its day is Oct 22 in any time zone the tests run in
const SCANNED_AT = "2026-10-22T12:00:00Z"

// the chart's markup with its props
function renderChart(chartProps: Partial<ComponentProps<typeof SourceResultsChart>>): string {
	return renderToStaticMarkup(
		<SourceResultsChart
			sourceResults={[]}
			scannedAt={SCANNED_AT}
			earlierKeptCount={0}
			earlierFoundCount={0}
			{...chartProps}
		/>,
	)
}

// the markup of each row, in order
function toRowsMarkup(html: string): string[] {
	return html.split("<li ").slice(1)
}

test("rows sort by kept, then read, both descending", () => {
	const rows = toSourceResultRows([
		toOkResult({ sourceId: "a", keptCount: 2, foundCount: 10 }),
		toOkResult({ sourceId: "b", keptCount: 3, foundCount: 4 }),
		toOkResult({ sourceId: "c", keptCount: 2, foundCount: 12 }),
	])
	expect(rows.map((row) => `${row.keptCount}/${row.foundCount}`)).toEqual(["3/4", "2/12", "2/10"])
})

test("a failed Source sorts after a Source that read nothing, and the label breaks a tie left", () => {
	const rows = toSourceResultRows([
		toFailedResult("failed", null),
		toOkResult({ sourceId: "zeta", keptCount: 0, foundCount: 0 }),
		toOkResult({ sourceId: "alpha", keptCount: 0, foundCount: 0 }),
	])
	expect(rows.map((row) => row.sourceId)).toEqual(["alpha", "zeta", "failed"])
})

test("the summary line sums the rows and adds the findings from earlier scans to kept and read", () => {
	const rows = toSourceResultRows([
		toOkResult({ sourceId: "a", keptCount: 2, foundCount: 4 }),
		toOkResult({ sourceId: "b", keptCount: 2, foundCount: 3 }),
		toOkResult({ sourceId: "c", keptCount: 1, foundCount: 3 }),
		toOkResult({ sourceId: "d", keptCount: 0, foundCount: 0 }),
	])
	expect(toSourceResultsLine({ rows, earlierKeptCount: 30, earlierFoundCount: 40 })).toBe(
		"35 kept from 50 read across 4 sources.",
	)
})

test("the heading reads Source footnotes in the display font with the scan's date on the right", () => {
	const html = renderChart({ sourceResults: [toOkResult({ sourceId: "a", keptCount: 1, foundCount: 2 })] })
	expect(html).toContain("Source footnotes")
	expect(html).toContain(RECAP_HEADING_CLASS)
	expect(html).toContain("Oct 22")
	expect(html.indexOf("Oct 22")).toBeGreaterThan(html.indexOf("Source footnotes"))
})

test("one source reads as singular", () => {
	const rows = [toOkResult({ sourceId: "web", keptCount: 6, foundCount: 42 })]
	expect(toSourceResultsLine({ rows, earlierKeptCount: 0, earlierFoundCount: 0 })).toBe(
		"6 kept from 42 read across 1 source.",
	)
})

test("the hint reads the same with a cost or without one", () => {
	// the owner's chart has a cost, and a visitor's has none
	const ownerHtml = renderChart({ sourceResults: [toOkResult({ sourceId: "a", keptCount: 1, foundCount: 2 })] })
	const visitorHtml = renderChart({
		sourceResults: [toOkResult({ sourceId: "a", keptCount: 1, foundCount: 2, costDollars: null })],
	})
	expect(ownerHtml).toContain("Tap a source for details.")
	expect(visitorHtml).toContain("Tap a source for details.")
})

test("the read bar spans the track for the row that read the most, and the others in proportion", () => {
	const html = renderChart({
		sourceResults: [
			toOkResult({ sourceId: "a", keptCount: 0, foundCount: 20 }),
			toOkResult({ sourceId: "b", keptCount: 0, foundCount: 5 }),
		],
	})

	// the first row's bar spans the track, and the second a quarter of it
	const [firstRow = "", secondRow = ""] = toRowsMarkup(html)
	expect(firstRow).toContain("width:100%")
	expect(secondRow).toContain("width:25%")
})

test("one kept finding fills at least the minimum width", () => {
	const html = renderChart({
		sourceResults: [
			toOkResult({ sourceId: "a", keptCount: 1, foundCount: 200 }),
			toOkResult({ sourceId: "b", keptCount: 0, foundCount: 200 }),
		],
	})
	expect(toRowsMarkup(html)[0]).toContain("width:max(6px, 0.5%)")
})

test("a failed row shows failed in the error color on an empty track", () => {
	const html = renderChart({
		sourceResults: [toOkResult({ sourceId: "a", keptCount: 1, foundCount: 4 }), toFailedResult("broken", null)],
	})

	// the failed row reads failed in red, to a screen reader too, over a track with no bar
	const failedRow = toRowsMarkup(html)[1] ?? ""
	expect(failedRow).toContain('class="text-destructive">failed</span>')
	expect(failedRow).toContain("broken, failed")
	expect(failedRow).not.toContain("bg-separator-strong")
	expect(failedRow).not.toContain("bg-primary")
})

test("a fallback row's detail names its fallback mode", () => {
	const html = renderChart({ sourceResults: [FALLBACK_RESULT], initialOpenRowId: "reddit" })
	expect(html).toContain("Fell back to Reddit&#x27;s public RSS feed")
})

test("an ok row's detail shows its counts, cost, and time, and no status", () => {
	const html = renderChart({
		sourceResults: [
			toOkResult({ sourceId: "web", keptCount: 6, foundCount: 121, costDollars: 0.031, durationMs: 41_000 }),
		],
		initialOpenRowId: "web",
	})

	// the counts, cost, and time show, and no status line
	expect(html).toContain("read 121 · kept 6 · cost $0.031 · time 41s")
	expect(html).not.toContain("Fell back")
	expect(html).not.toContain("Failed")
})

test("a failed row's detail shows its reason only if the api sent one", () => {
	// the owner's result has a reason, and a visitor's has none
	const ownerHtml = renderChart({ sourceResults: [toFailedResult("page", "403 Forbidden")], initialOpenRowId: "page" })
	const visitorHtml = renderChart({ sourceResults: [toFailedResult("page", null)], initialOpenRowId: "page" })

	// the reason follows Failed only on the owner's chart
	expect(ownerHtml).toContain("Failed: 403 Forbidden")
	expect(visitorHtml).toContain(">Failed</span>")
})

test("a null cost prints no cost", () => {
	const html = renderChart({
		sourceResults: [toOkResult({ sourceId: "web", keptCount: 1, foundCount: 3, costDollars: null, durationMs: 400 })],
		initialOpenRowId: "web",
	})

	// the detail line goes from kept straight to the time
	expect(html).toContain("read 3 · kept 1 · time 0.4s")
	expect(html).not.toContain("$")
})

test("the initially open row is expanded with its detail, and every other row is closed", () => {
	const html = renderChart({
		sourceResults: [
			toOkResult({ sourceId: "a", keptCount: 2, foundCount: 4 }),
			toOkResult({ sourceId: "b", keptCount: 1, foundCount: 4 }),
		],
		initialOpenRowId: "b",
	})
	const [firstRow = "", secondRow = ""] = toRowsMarkup(html)

	// the open row's button controls the detail line rendered under it
	expect(secondRow).toContain('aria-expanded="true"')
	const detailId = secondRow.match(/aria-controls="([^"]+)"/)?.[1]
	expect(secondRow).toContain(`id="${detailId}"`)

	// the closed row has no detail line
	expect(firstRow).toContain('aria-expanded="false"')
	expect(firstRow).not.toContain("read 4 · kept 2")
})

test("a scan's findings from earlier scans show as the last row with its kept count alone", () => {
	const html = renderChart({
		sourceResults: [toOkResult({ sourceId: "a", keptCount: 5, foundCount: 10 })],
		earlierKeptCount: 30,
		earlierFoundCount: 40,
		initialOpenRowId: EARLIER_ROW_ID,
	})

	// the last row names the earlier findings and explains them, and the line counts them as kept and read
	const earlierRow = toRowsMarkup(html).at(-1) ?? ""
	expect(earlierRow).toContain("Earlier brew findings")
	expect(earlierRow).toContain(">30<")
	expect(earlierRow).not.toContain(" / ")
	expect(earlierRow).toContain("No source returned them this time.")
	expect(html).toContain("35 kept from 50 read across 1 source.")
})

test("earlier findings read again with none kept still get their row", () => {
	const html = renderChart({
		sourceResults: [toOkResult({ sourceId: "a", keptCount: 1, foundCount: 3 })],
		earlierFoundCount: 6,
	})
	expect(toRowsMarkup(html).at(-1)).toContain("Earlier brew findings")
	expect(html).toContain("1 kept from 9 read across 1 source.")
})

test("a chart with no rows renders nothing", () => {
	expect(renderChart({ sourceResults: [] })).toBe("")
})

test("a long label truncates, and its row opens the tooltip that names it in full", () => {
	const label = "https://example.com/a/very/long/path/that/never/fits/in/the/label/column/of/the/chart"
	const html = renderChart({ sourceResults: [toOkResult({ sourceId: "url", keptCount: 0, foundCount: 1, label })] })
	expect(html).toContain('class="text-link truncate"')
	expect(html).toContain('data-slot="tooltip-trigger"')
	expect(html).not.toContain("title=")
})

test("an open row of a removable Source shows the trash button", () => {
	const html = renderChart({
		sourceResults: [toOkResult({ sourceId: "web", keptCount: 1, foundCount: 3 })],
		initialOpenRowId: "web",
		sourceRemoval: { removableSourceIds: new Set(["web"]), onRemoveSource: () => {} },
	})
	expect(html).toContain('aria-label="Remove source"')
})

test("no trash button shows without a source removal, for a removed Source, or on the earlier row", () => {
	// a chart with no source removal, as the Activity page renders it
	const sourceResults = [toOkResult({ sourceId: "web", keptCount: 1, foundCount: 3 })]
	const activityHtml = renderChart({ sourceResults, initialOpenRowId: "web" })

	// a past scan's row of a Source the topic has since removed
	const removedSourceHtml = renderChart({
		sourceResults,
		initialOpenRowId: "web",
		sourceRemoval: { removableSourceIds: new Set(["another-source"]), onRemoveSource: () => {} },
	})

	// the earlier row, open on a chart whose every Source is removable
	const earlierRowHtml = renderChart({
		sourceResults,
		earlierKeptCount: 2,
		initialOpenRowId: EARLIER_ROW_ID,
		sourceRemoval: { removableSourceIds: new Set(["web", EARLIER_ROW_ID]), onRemoveSource: () => {} },
	})

	// none of the three shows the trash button
	expect(activityHtml).not.toContain("Remove source")
	expect(removedSourceHtml).not.toContain("Remove source")
	expect(earlierRowHtml).not.toContain("Remove source")
})
