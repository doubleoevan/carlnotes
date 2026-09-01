// link preview tests: finding the url in a message, reading a page's meta tags, and rejecting a url that must not be fetched
import { expect, test } from "bun:test"
import {
	fetchLinkPreviewImage,
	fetchLinkPreviewMetadata,
	toLinkPreviewMetaTags,
	toLinkPreviewUrls,
	toNormalizedLinkPreviewUrl,
} from "./linkPreview"

// the first url in a message is the one that gets a card
test("toLinkPreviewUrls returns the first http url in a message", () => {
	expect(toLinkPreviewUrls("look at https://example.com/piece today", 1)[0]).toBe("https://example.com/piece")
	expect(toLinkPreviewUrls("http://example.com and https://other.com", 1)[0]).toBe("http://example.com")
})

// a markdown link inside parentheses ends in a run of brackets, and only the url is the cache key
test("toLinkPreviewUrls trims every trailing bracket a sentence wrapped the url in", () => {
	expect(toLinkPreviewUrls("([the piece](https://example.com/a-b/)). more", 1)[0]).toBe("https://example.com/a-b/")
	expect(toLinkPreviewUrls("wrapped ((https://example.com/x)) here", 1)[0]).toBe("https://example.com/x")
})

// a url that opened its own bracket keeps it, so a wikipedia link still resolves
test("toLinkPreviewUrls keeps a bracket the url opened itself", () => {
	expect(toLinkPreviewUrls("read https://en.wikipedia.org/wiki/Foo_(bar)", 1)[0]).toBe(
		"https://en.wikipedia.org/wiki/Foo_(bar)",
	)
})

// a message with no link gets no link preview at all
test("toLinkPreviewUrls returns nothing when the message holds no link", () => {
	expect(toLinkPreviewUrls("no links here", 1)).toEqual([])
	expect(toLinkPreviewUrls("ftp://example.com/file", 1)).toEqual([])
})

// a url written at the end of a sentence keeps its own characters and drops the sentence's
test("toLinkPreviewUrls leaves trailing sentence punctuation out of the url", () => {
	expect(toLinkPreviewUrls("read https://example.com/piece.", 1)[0]).toBe("https://example.com/piece")
	expect(toLinkPreviewUrls("read https://example.com/piece!", 1)[0]).toBe("https://example.com/piece")

	// a bracket the url opened is part of it, and one it did not open is punctuation
	expect(toLinkPreviewUrls("see https://example.com/a_(b)", 1)[0]).toBe("https://example.com/a_(b)")
	expect(toLinkPreviewUrls("(see https://example.com/piece)", 1)[0]).toBe("https://example.com/piece")
})

// the cache key drops the fragment, so two links to the same page share one link preview
test("toNormalizedLinkPreviewUrl drops the fragment and lowercases the host", () => {
	expect(toNormalizedLinkPreviewUrl("https://Example.com/piece#section")).toBe("https://example.com/piece")
})

// an internal address is rejected before any fetch happens
test("toNormalizedLinkPreviewUrl throws for a url that must not be fetched", () => {
	expect(() => toNormalizedLinkPreviewUrl("http://localhost:3000/admin")).toThrow(/internal address/)
	expect(() => toNormalizedLinkPreviewUrl("http://192.168.1.1/")).toThrow(/internal address/)
	expect(() => toNormalizedLinkPreviewUrl("http://169.254.169.254/latest/meta-data")).toThrow(/internal address/)
	expect(() => toNormalizedLinkPreviewUrl("file:///etc/passwd")).toThrow(/must be http or https/)
	expect(() => toNormalizedLinkPreviewUrl("not a url")).toThrow(/malformed url/)
})

// the OpenGraph tags are what a page publishes for a link preview
test("toLinkPreviewMeta reads the OpenGraph title, description, and image", async () => {
	const html = `<html><head>
		<meta property="og:title" content="The piece" />
		<meta property="og:description" content="What the piece is about" />
		<meta property="og:image" content="https://example.com/cover.png" />
	</head><body>ignored</body></html>`

	const metaTags = await toLinkPreviewMetaTags(html)
	expect(metaTags.title).toBe("The piece")
	expect(metaTags.description).toBe("What the piece is about")
	expect(metaTags.imageUrl).toBe("https://example.com/cover.png")
})

// a page that published no OpenGraph tags still has a title and a description
test("toLinkPreviewMeta falls back to the plain title and description", async () => {
	const html = `<html><head>
		<title>A plain title</title>
		<meta name="description" content="A plain description" />
	</head><body></body></html>`

	const metaTags = await toLinkPreviewMetaTags(html)
	expect(metaTags.title).toBe("A plain title")
	expect(metaTags.description).toBe("A plain description")
	expect(metaTags.imageUrl).toBeNull()
})

// an og value wins over the plain tag that says the same thing
test("toLinkPreviewMeta prefers the OpenGraph values over the plain ones", async () => {
	const html = `<html><head>
		<title>The plain title</title>
		<meta name="description" content="The plain description" />
		<meta property="og:title" content="The og title" />
		<meta property="og:description" content="The og description" />
	</head><body></body></html>`

	const metaTags = await toLinkPreviewMetaTags(html)
	expect(metaTags.title).toBe("The og title")
	expect(metaTags.description).toBe("The og description")
})

// a title spread over several lines collapses to one, and a page with no tags at all offers nothing
test("toLinkPreviewMeta collapses whitespace and returns null for what a page did not publish", async () => {
	const spacedMeta = await toLinkPreviewMetaTags("<html><head><title>\n  A  spaced\n  title\n</title></head></html>")
	expect(spacedMeta.title).toBe("A spaced title")

	// a page with no title and no description has no link preview to show
	const emptyMeta = await toLinkPreviewMetaTags("<html><head></head><body>words</body></html>")
	expect(emptyMeta.title).toBeNull()
	expect(emptyMeta.description).toBeNull()
})

// a page's own words are never taken from a tag that named no content
test("toLinkPreviewMeta ignores a meta tag with no content", async () => {
	const metaTags = await toLinkPreviewMetaTags(
		'<html><head><meta property="og:title" /><title>The title</title></head></html>',
	)
	expect(metaTags.title).toBe("The title")
})

// the fetch itself rejects an internal address before it opens a connection
test("fetchLinkPreviewMeta rejects a url that resolves internally", async () => {
	expect(fetchLinkPreviewMetadata("http://127.0.0.1/admin")).rejects.toThrow(/internal address/)
	expect(fetchLinkPreviewMetadata("http://metadata.internal/")).rejects.toThrow(/internal address/)
})

// an image url gets the same guard the page did, so an image host pointing inward is rejected too
test("fetchLinkPreviewImage rejects an internal image url", async () => {
	expect(fetchLinkPreviewImage("http://10.0.0.1/cover.png")).rejects.toThrow(/internal address/)
})

// a public page that redirects inward must not be previewed
test("a link preview fetch fails closed on a redirect chain ending at an internal address", async () => {
	// stand in for the network so the test never leaves the machine
	const originalFetch = globalThis.fetch
	const requestedUrls: string[] = []
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = input.toString()
		requestedUrls.push(url)

		// the page bounces to the cloud metadata address, and the image bounces to a private one
		if (url.startsWith("https://public.example/bounce")) {
			return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })
		}
		if (url.startsWith("https://public.example/cover.png")) {
			return new Response(null, { status: 302, headers: { location: "http://10.0.0.5/cover.png" } })
		}
		return new Response("<html><head><title>public</title></head></html>", {
			headers: { "content-type": "text/html" },
		})
	}) as typeof fetch

	try {
		// the page and the image both throw, and neither internal address is ever requested
		await expect(fetchLinkPreviewMetadata("https://public.example/bounce")).rejects.toThrow(/internal address/)
		await expect(fetchLinkPreviewImage("https://public.example/cover.png")).rejects.toThrow(/internal address/)
		expect(requestedUrls).not.toContain("http://169.254.169.254/latest/meta-data")
		expect(requestedUrls).not.toContain("http://10.0.0.5/cover.png")
	} finally {
		globalThis.fetch = originalFetch
	}
})

// a host that does not answer throws with the connection error
test("a link preview fetch throws when the host does not answer", async () => {
	// stand in for the network with a host that refuses the connection
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async (_input: string | URL | Request): Promise<Response> => {
		throw new Error("connect ECONNREFUSED")
	}) as typeof fetch

	try {
		await expect(fetchLinkPreviewMetadata("https://dead.example/piece")).rejects.toThrow(/ECONNREFUSED/)
	} finally {
		globalThis.fetch = originalFetch
	}
})

// a page that answers with something other than HTML has no meta tags to read
test("a link preview fetch throws when the page is not html", async () => {
	// stand in for the network with a page that answers as json
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async (_input: string | URL | Request) =>
		new Response('{"ok":true}', { headers: { "content-type": "application/json" } })) as typeof fetch

	try {
		await expect(fetchLinkPreviewMetadata("https://public.example/data")).rejects.toThrow(/application\/json/)
	} finally {
		globalThis.fetch = originalFetch
	}
})
