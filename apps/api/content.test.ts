// tests for the server-rendered blog pages, the page head they share, and the order the index lists them in
import { expect, test } from "bun:test"
import { compareNewestFirst, contentRoute } from "./content"

// the feed link the ui's root head also includes
const FEED_LINK = '<link rel="alternate" type="application/rss+xml" title="CarlNotes" href="/feed.xml">'

// the blog index and a blog page both link the site feed from their page head
test("a blog page's head links the site feed", async () => {
	const pageHtmls = await Promise.all(
		["/blog", "/blog/what-is-carlnotes"].map(async (path) => (await contentRoute.request(path)).text()),
	)

	// the link sits in the head, not the body
	for (const pageHtml of pageHtmls) {
		const headHtml = pageHtml.slice(0, pageHtml.indexOf("</head>"))
		expect(headHtml).toContain(FEED_LINK)
	}
})

// a page with the given slug and date, and nothing else the order reads
function toPage(slug: string, date: string): Parameters<typeof compareNewestFirst>[0] {
	return { slug, date, title: slug, description: "", body: "" }
}

// two pages on the same date sort by slug, so the index order does not depend on the file system's listing order
test("compareNewestFirst puts the newest page first and breaks a date tie by slug", () => {
	const pages = [
		toPage("what-is-carlnotes", "2026-08-12"),
		toPage("hello", "2026-09-01"),
		toPage("alerts", "2026-08-12"),
	]
	expect(pages.sort(compareNewestFirst).map((page) => page.slug)).toEqual(["hello", "alerts", "what-is-carlnotes"])
})
