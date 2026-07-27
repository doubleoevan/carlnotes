// topic-scan email tests: the rendered HTML lists each finding, links it, and escapes finding text
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
