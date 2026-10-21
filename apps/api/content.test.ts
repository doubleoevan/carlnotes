// tests for the server-rendered blog pages and the page head they share
import { expect, test } from "bun:test"
import { contentRoute } from "./content"

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
