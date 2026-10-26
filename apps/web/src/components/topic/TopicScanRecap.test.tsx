// render tests for allowed urls, and for where the source footnotes chart sits in the recap
import { expect, test } from "bun:test"
import type { ScanSourceResults } from "@carlnotes/contracts/topics"
import type { ScanRecapFields } from "@carlnotes/core/lib/topicScanRecap"
import { renderToStaticMarkup } from "react-dom/server"
import { ScrollNote, TopicScanRecap } from "./TopicScanRecap"

// one note trying every escape hatch at once: a written link, raw HTML, an image, and a bare url to convert to plain text
const HOSTILE_NOTE = [
	"**The numbers:** 3 kept.",
	"- [click me](https://evil.test)",
	'<a href="https://evil.test">or here</a>',
	"![carl](https://evil.test/x.png)",
	"Findings: https://real.example/post",
].join("\n\n")

// the allowed structure renders as markup while unauthorized links render as plain text
test("a note renders formatting but nothing clickable or embedded", () => {
	const html = renderToStaticMarkup(<ScrollNote note={HOSTILE_NOTE} />)

	// bold and the list render as real elements
	expect(html).toContain("<strong")
	expect(html).toContain("<li")

	// no anchor and no image anywhere in the output
	expect(html).not.toContain("<a ")
	expect(html).not.toContain("<img")

	// the written link keeps its label and shows its destination as plain text
	expect(html).toContain("click me")
	expect(html).toContain("(https://evil.test)")

	// raw HTML reads as the characters the model typed
	expect(html).toContain("&lt;a href=")

	// the bare url renders only once as text, not as a label and again as a destination
	expect(html.split("https://real.example/post")).toHaveLength(2)
})

// a kept Finding's own url is allowed
test("a link to a kept finding's url renders as an anchor while others stay plain text", () => {
	// one citation of a kept finding and one of an attacker's choosing, in the same note
	const note = "Findings:\n\n- [the agent piece](https://kept.example/post)\n- [click me](https://evil.test)"
	const html = renderToStaticMarkup(<ScrollNote note={note} allowedUrls={new Set(["https://kept.example/post"])} />)

	// the kept citation is a real anchor to its stored url
	expect(html).toContain('href="https://kept.example/post"')
	expect(html).toContain("the agent piece")

	// the other link is plain text showing its destination without an anchor
	expect(html).not.toContain('href="https://evil.test"')
	expect(html).toContain("(https://evil.test)")
})

// a finished scan's recap fields, with a note, four minutes taken, and no source results
const FINISHED_SCAN: ScanRecapFields = {
	status: "succeeded",
	error: null,
	startedAt: "2026-07-15T13:00:00.000Z",
	finishedAt: "2026-07-15T13:04:00.000Z",
	stoppedAt: null,
	scanSummary: "Read 12 resources and kept 4.",
	sourceResults: null,
	costDollars: null,
}

// one Source that read 12 and kept 4
const SOURCE_RESULTS: ScanSourceResults = {
	sources: [
		{
			sourceId: "source-web",
			sourceKind: "search",
			label: "web search",
			status: "ok",
			foundCount: 12,
			keptCount: 4,
			costDollars: null,
			durationMs: 3_200,
		},
	],
	earlierKeptCount: 0,
	earlierFoundCount: 0,
}

// a scan saved before source results were recorded keeps the popover as it was
test("a scan with no source results renders no chart", () => {
	const html = renderToStaticMarkup(<TopicScanRecap scan={FINISHED_SCAN} />)
	expect(html).not.toContain("Source footnotes")
	expect(html).toContain("4 min taken")
})

// the chart sits between Carl's notes and the time and cost footer
test("a scan with source results renders the chart after the note and before the footer", () => {
	const html = renderToStaticMarkup(<TopicScanRecap scan={{ ...FINISHED_SCAN, sourceResults: SOURCE_RESULTS }} />)

	// the note, the chart, and the footer appear in that order
	const noteIndex = html.indexOf("Read 12 resources and kept 4.")
	const chartIndex = html.indexOf("Source footnotes")
	const footerIndex = html.indexOf("4 min taken")
	expect(noteIndex).toBeGreaterThan(-1)
	expect(chartIndex).toBeGreaterThan(noteIndex)
	expect(footerIndex).toBeGreaterThan(chartIndex)
	expect(html).toContain("4 kept from 12 read across 1 source.")
})
