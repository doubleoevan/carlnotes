// tests for the document routes, the seo files they serve, and a topic's description
import { expect, test } from "bun:test"
import type { PublicTopic } from "@shared/contracts"
import { documentsRoute } from "./documents"
import { loadDocsPages, toLlmsFullTxt, toLlmsTxt, toSecurityTxt, toTopicDescription } from "./seo"

// a public topic as loadPublicTopics returns it
const PUBLIC_TOPIC = {
	id: "topic-public",
	name: "Coffee gear reviews",
	description: "Grinders, kettles, and scales, reviewed.",
	feedUpdatedAt: "2026-08-20T00:00:00.000Z",
} satisfies PublicTopic

// one blog page in the shape loadPages returns
const BLOG_PAGE = {
	slug: "what-is-carlnotes",
	title: "What is CarlNotes",
	description: "The pitch.",
	body: "Carl reads.",
}

// the convention: an H1, a blockquote one-liner, then the linked sections
test("llms.txt follows the convention", () => {
	const llmsTxt = toLlmsTxt({
		appUrl: "https://carlnotes.com",
		docsPages: loadDocsPages(),
		blogPages: [BLOG_PAGE],
		publicTopics: [PUBLIC_TOPIC],
	})
	expect(llmsTxt.startsWith("# CarlNotes\n\n> ")).toBe(true)

	// a topic links to its page by slug and id
	expect(llmsTxt).toContain("(https://carlnotes.com/topics/topic-public/coffee-gear-reviews)")

	// the sections appear in reading order
	const sectionOffsets = ["## About", "## Docs", "## Blog", "## Topics"].map((section) => llmsTxt.indexOf(section))
	expect(sectionOffsets.every((offset, index) => offset > (sectionOffsets[index - 1] ?? -1))).toBe(true)

	// the docs links come from the real docs tree. the entry page leads, with starlight's trailing slash
	expect(llmsTxt).toContain("(https://carlnotes.com/docs/)")
	expect(llmsTxt.indexOf("/docs/)")).toBeLessThan(llmsTxt.indexOf("/docs/quickstart/"))
})

// the long form includes the docs and blog text whole, and no topic content
test("llms-full.txt includes page bodies and no topics", () => {
	const llmsFullTxt = toLlmsFullTxt({
		appUrl: "https://carlnotes.com",
		docsPages: loadDocsPages(),
		blogPages: [BLOG_PAGE],
	})

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

// the site feed responds as rss with the blog inside it
test("/feed.xml serves the site feed as rss", async () => {
	const response = await documentsRoute.request("/feed.xml")

	// the rss content type, and a blog link in the body
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8")
	const feedXml = await response.text()
	expect(feedXml).toContain("<rss")
	expect(feedXml).toContain("/blog/")
})

// the vulnerability contact file, served from the route
test("/.well-known/security.txt serves the contact file", async () => {
	const response = await documentsRoute.request("/.well-known/security.txt")

	// plain text, the contact address, and an expiry still in the future
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
	const securityTxt = await response.text()
	expect(securityTxt).toContain("Contact: mailto:support@carlnotes.com")
	const expiresAt = securityTxt.match(/Expires: (.+)/)?.[1]
	expect(new Date(expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now())
})

// the llms route responds with text/plain under the topic feed's cache window
test("the llms route responds with text/plain under the shared cache window", async () => {
	const response = await documentsRoute.request("/llms-full.txt")
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

// a topic's description prefers its last scan's summary, then its prompt, then its name
test("toTopicDescription falls back from the scan summary to the prompt to the name", () => {
	const summarizedTopic = { name: "Agents", prompt: "Agent releases.", scanSummary: "Agents shipped." }
	expect(toTopicDescription(summarizedTopic)).toBe("Agents shipped.")
	expect(toTopicDescription({ name: "Agents", prompt: "Agent releases.", scanSummary: null })).toBe("Agent releases.")
	expect(toTopicDescription({ name: "Agents", prompt: "", scanSummary: "" })).toBe("Agents")
})

// IndexNow reads the key from /indexnow.txt, which exists only while a key is set
test("/indexnow.txt serves the IndexNow key, and a 404 without one", async () => {
	// keep the environment's key to restore afterwards
	const originalIndexNowKey = Bun.env.INDEXNOW_KEY
	try {
		// a set key is the whole body
		Bun.env.INDEXNOW_KEY = "test-indexnow-key"
		const keyResponse = await documentsRoute.request("/indexnow.txt")
		expect(keyResponse.status).toBe(200)
		expect(await keyResponse.text()).toBe("test-indexnow-key")

		// an unset key has no file to serve
		delete Bun.env.INDEXNOW_KEY
		expect((await documentsRoute.request("/indexnow.txt")).status).toBe(404)
	} finally {
		// restore the key the test found
		if (originalIndexNowKey === undefined) {
			delete Bun.env.INDEXNOW_KEY
		} else {
			Bun.env.INDEXNOW_KEY = originalIndexNowKey
		}
	}
})

// the plans page's old path redirects permanently to its new one
test("/pricing redirects permanently to /plans", async () => {
	const response = await documentsRoute.request("/pricing")
	expect(response.status).toBe(301)
	expect(response.headers.get("Location")).toBe("/plans")
})
