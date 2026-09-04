// feed tests for the one thing a scraped title can break: the xml document itself
import { expect, test } from "bun:test"
import { toSiteFeedXml } from "./feed"

// a finding's title and explanation both come from scraped pages, so either can hold anything
function feedItem(
	title: string,
	publishedAt = new Date("2026-01-01T00:00:00.000Z"),
): { title: string; url: string; explanation: string; publishedAt: Date } {
	return { title, url: "https://example.test/article", explanation: title, publishedAt }
}

// one unescaped title breaks the document for every subscriber at once, not just its own item
test("toSiteFeedXml escapes what a scraped title puts in it", () => {
	const xml = toSiteFeedXml("https://carlnotes.test", [feedItem('Bud & "Lou" <script>alert(1)</script>')])

	// the metacharacters arrive escaped, so none of them can close a tag or open one
	expect(xml).toContain("&amp;")
	expect(xml).toContain("&lt;script&gt;")
	expect(xml).not.toContain("<script>")
})

// xml 1.0 rejects most control characters even escaped, so a title holding one must not reach the document
test("toSiteFeedXml drops the control characters xml rejects", () => {
	const xml = toSiteFeedXml("https://carlnotes.test", [feedItem("Before\u0000\u0008after")])

	// the characters are gone instead of escaped, and the words around them survive
	expect(xml).not.toContain("\u0000")
	expect(xml).not.toContain("\u0008")
	expect(xml).toContain("Beforeafter")

	// tab, newline, and carriage return are the three xml does accept
	expect(toSiteFeedXml("https://carlnotes.test", [feedItem("kept\ttab")])).toContain("kept\ttab")
})

// the newest item leads the feed no matter how the caller ordered them
test("toSiteFeedXml orders the items newest first", () => {
	const older = feedItem("older", new Date("2026-01-01T00:00:00.000Z"))
	const newer = feedItem("newer", new Date("2026-06-01T00:00:00.000Z"))
	const xml = toSiteFeedXml("https://carlnotes.test", [older, newer])
	expect(xml.indexOf("newer")).toBeLessThan(xml.indexOf("older"))
})
