// topic-scan email tests: the rendered HTML lists each finding, numbered, links it, and escapes finding text
import { expect, test } from "bun:test"
import { renderTopicScanEmail } from "./topic-scan-email"

// the render lists each new Finding with its link and note, falling back to the url when a title is missing, and escapes HTML
test("renderTopicScanEmail lists findings, links them, and escapes text", async () => {
	// two findings: one with a note, one with a null title that falls back to its url
	const html = await renderTopicScanEmail({
		topicName: "LLM tooling",
		findingCount: 3,
		findings: [
			{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "covers <agents> & tools" },
			{ title: null, url: "https://b.com/2", relevanceExplanation: "" },
		],
	})

	// the topic name, both links, the null-title url fallback, and escaped html-significant characters
	expect(html).toContain("LLM tooling")
	expect(html).toContain("https://a.com/1")
	expect(html).toContain("https://b.com/2")
	expect(html).toContain("&lt;agents&gt;")
})

// a scan that kept nothing still sends, with Carl's aside standing in for the missing findings list
test("renderTopicScanEmail reports a scan that kept nothing new", async () => {
	const html = await renderTopicScanEmail({ topicName: "LLM tooling", findingCount: 0, findings: [] })

	expect(html).toContain("found nothing new worth your time")
	expect(html).toContain("Carl has high standards.")
})

// each card is numbered by its position in the findings array, the order the caller's query already ranked them in
test("renderTopicScanEmail numbers each finding by its array position", async () => {
	const html = await renderTopicScanEmail({
		topicName: "LLM tooling",
		findingCount: 2,
		findings: [
			{ title: "First", url: "https://a.com/1", relevanceExplanation: "" },
			{ title: "Second", url: "https://b.com/2", relevanceExplanation: "" },
		],
	})

	// split on the number span's unique style, so each segment starts right after one card's number opens.
	// splitting rather than a strict tag-adjacency regex tolerates however the renderer spaces the markup
	const cards = html.split('font-weight:400">').slice(1)
	expect(cards).toHaveLength(2)
	const [firstCard, secondCard] = cards as [string, string]
	expect(firstCard.startsWith("1")).toBe(true)
	expect(firstCard).toContain("First")
	expect(secondCard.startsWith("2")).toBe(true)
	expect(secondCard).toContain("Second")
})

// the recap renders through a limited Markdown subset. formatting survives, but a link only works when it points
// at one of this email's own Finding urls. everything else, the relevance explanation included, stays plain text
test("renderTopicScanEmail renders the recap with formatting and only kept-finding links", async () => {
	// a recap citing the kept finding and an attacker's url, plus raw html, an image, and a note smuggling a link
	const html = await renderTopicScanEmail({
		topicName: "LLM tooling",
		findingCount: 1,
		findings: [{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "see [here](https://evil.test)" }],
		scanSummary:
			'**The numbers:** 3 kept.\n\nSources: [the agent piece](https://a.com/1) and [click me](https://evil.test)\n\n<a href="https://evil.test">or here</a> <img src="x">',
	})

	// the allowed formatting renders as real markup
	expect(html).toContain("<strong")

	// the kept finding's citation is a real anchor, since the finding card below already links there
	expect(html).toContain("the agent piece</a>")

	// the attacker's link keeps its label, shows its destination as text, and no anchor points at it
	expect(html).toContain("click me")
	expect(html).toContain("(https://evil.test)")
	expect(html).not.toContain('href="https://evil.test"')

	// raw HTML reads as the characters the model typed, and no image tag is produced
	expect(html).toContain("&lt;a href=")
	expect(html).not.toContain("<img")

	// the relevance explanation is plain text, so its link syntax stays literal
	expect(html).toContain("[here](https://evil.test)")
})
