// the seo discovery files: llms.txt, llms-full.txt, the site feed, and security.txt
import { expect, test } from "bun:test"
import { pagesRoute } from "./pages"
import { loadDocsPages, toLlmsFullTxt, toLlmsTxt, toSecurityTxt } from "./seo"

// a public and a private topic row, shaped as the shared query returns them
const PUBLIC_TOPIC = {
	id: "topic-public",
	name: "Coffee gear reviews",
	visibility: "public",
	updatedAt: new Date("2026-08-20"),
}
const PRIVATE_TOPIC = {
	id: "topic-private",
	name: "Secret acquisition notes",
	visibility: "private",
	updatedAt: new Date("2026-08-26"),
}

// one blog page in the shape loadPages returns
const BLOG_PAGE = {
	slug: "what-is-carlnotes",
	title: "What is CarlNotes",
	description: "The pitch.",
	body: "Carl reads.",
}

// the builder rejects a non-public row on its own. the query filters public as well
test("a private topic never appears in llms.txt", () => {
	const llmsTxt = toLlmsTxt("https://carlnotes.com", loadDocsPages(), [BLOG_PAGE], [PUBLIC_TOPIC, PRIVATE_TOPIC])

	// the public one prints. nothing of the private one does, name or id
	expect(llmsTxt).toContain("Coffee gear reviews")
	expect(llmsTxt).not.toContain("Secret acquisition notes")
	expect(llmsTxt).not.toContain("topic-private")
})

// the convention: an H1, a blockquote one-liner, then the linked sections
test("llms.txt follows the convention", () => {
	const llmsTxt = toLlmsTxt("https://carlnotes.com", loadDocsPages(), [BLOG_PAGE], [PUBLIC_TOPIC])
	expect(llmsTxt.startsWith("# CarlNotes\n\n> ")).toBe(true)

	// the sections appear in reading order
	const sectionOffsets = ["## About", "## Docs", "## Blog", "## Topics"].map((section) => llmsTxt.indexOf(section))
	expect(sectionOffsets.every((offset, index) => offset > (sectionOffsets[index - 1] ?? -1))).toBe(true)

	// the docs links come from the real docs tree. the entry page leads, with starlight's trailing slash
	expect(llmsTxt).toContain("(https://carlnotes.com/docs/)")
	expect(llmsTxt.indexOf("/docs/)")).toBeLessThan(llmsTxt.indexOf("/docs/quickstart/"))
})

// the long form holds the docs and blog text whole, and no topic content
test("llms-full.txt holds page bodies and no topics", () => {
	const llmsFullTxt = toLlmsFullTxt("https://carlnotes.com", loadDocsPages(), [BLOG_PAGE])

	// blog title and body are present. no app topic page is, though docs section paths may mention topics
	expect(llmsFullTxt).toContain("# What is CarlNotes")
	expect(llmsFullTxt).toContain("Carl reads.")
	expect(llmsFullTxt).not.toMatch(/carlnotes\.com\/topics\//)
})

// the docs loader parses the folded frontmatter every docs page uses
test("every docs page parses with a title and description", () => {
	const docsPages = loadDocsPages()
	expect(docsPages.length).toBeGreaterThan(5)

	// no page comes back with an empty field
	for (const docsPage of docsPages) {
		expect(docsPage.title.length).toBeGreaterThan(0)
		expect(docsPage.description.length).toBeGreaterThan(0)
		expect(docsPage.body.length).toBeGreaterThan(0)
	}
})

// the site feed answers as rss with the blog inside it
test("/feed.xml serves the site feed as rss", async () => {
	const response = await pagesRoute.request("/feed.xml")

	// the rss content type, and a blog link in the body
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8")
	const feedXml = await response.text()
	expect(feedXml).toContain("<rss")
	expect(feedXml).toContain("/blog/")
})

// the vulnerability contact file, served from the route
test("/.well-known/security.txt serves the contact file", async () => {
	const response = await pagesRoute.request("/.well-known/security.txt")

	// plain text, the contact address, and an expiry still in the future
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
	const securityTxt = await response.text()
	expect(securityTxt).toContain("Contact: mailto:support@carlnotes.com")
	const expiresAt = securityTxt.match(/Expires: (.+)/)?.[1]
	expect(new Date(expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now())
})

// the llms route answers text/plain under the topic feed's cache window
test("the llms route answers text/plain under the shared cache window", async () => {
	const response = await pagesRoute.request("/llms-full.txt")
	expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=900")
})

// the expiry sits about a year out, and the canonical url names this file
test("security.txt expires about a year out", () => {
	const securityTxt = toSecurityTxt("https://carlnotes.com")
	const expiresAt = new Date(securityTxt.match(/Expires: (.+)/)?.[1] ?? 0)

	// twelve months, give or take the leap difference
	const daysOut = (expiresAt.getTime() - Date.now()) / 86_400_000
	expect(daysOut).toBeGreaterThan(360)
	expect(daysOut).toBeLessThan(370)
	expect(securityTxt).toContain("Canonical: https://carlnotes.com/.well-known/security.txt")
})
