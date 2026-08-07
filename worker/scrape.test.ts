// scrape tests for the conditional-refetch helpers
import { expect, test } from "bun:test"
import { conditionalHeaders, fetchPublicUrl, revalidationOutcome, toFetchableUrl } from "./scrape"

// conditionalHeaders carries only the validators that are stored, omitting an absent one
test("conditionalHeaders builds from whichever validators are stored", () => {
	// test only the etag, only the last-modified date, both, and neither headers are built
	expect(conditionalHeaders({ etag: '"abc"', lastModified: null })).toEqual({ "If-None-Match": '"abc"' })
	expect(conditionalHeaders({ etag: null, lastModified: "Wed, 21 Oct 2026 07:28:00 GMT" })).toEqual({
		"If-Modified-Since": "Wed, 21 Oct 2026 07:28:00 GMT",
	})
	expect(conditionalHeaders({ etag: '"abc"', lastModified: "Wed, 21 Oct 2026 07:28:00 GMT" })).toEqual({
		"If-None-Match": '"abc"',
		"If-Modified-Since": "Wed, 21 Oct 2026 07:28:00 GMT",
	})
	expect(conditionalHeaders({ etag: null, lastModified: null })).toEqual({})
})

// only a 304 means the stored content still stands. any other status is a change to refetch
test("revalidationOutcome maps 304 to not-modified and anything else to changed", () => {
	expect(revalidationOutcome(304)).toBe("not-modified")
	expect(revalidationOutcome(200)).toBe("changed")
	expect(revalidationOutcome(500)).toBe("changed")
})

// a Source or attachment url is owner-supplied, so the guard is what stops a Topic from reaching an internal address
test("toFetchableUrl rejects an internal url", () => {
	// a public https url passes through as a parsed target
	expect(toFetchableUrl("https://example.com/feed.xml").hostname).toBe("example.com")

	// a scheme that is not http(s) reaches the filesystem or inline data, so it never gets fetched
	expect(() => toFetchableUrl("file:///etc/passwd")).toThrow(/http/)
	expect(() => toFetchableUrl("not a url")).toThrow(/malformed/)

	// loopback, link-local (the cloud metadata address), and the private ranges are all rejected
	for (const url of [
		"http://localhost/admin",
		"http://127.0.0.1/admin",
		"http://169.254.169.254/latest/meta-data/",
		"http://10.0.0.5/",
		"http://192.168.1.1/",
		"http://172.16.0.1/",
		"http://db.internal/",
	]) {
		expect(() => toFetchableUrl(url)).toThrow(/is an internal address/)
	}
})

// a public page that redirects inward must not call fetch on it, since the first url is the only one fetch itself checks
test("fetchPublicUrl checks every redirect hop, not just the first url", async () => {
	// stand in for the network so the test never leaves the machine. each url answers the way the case under test needs
	const originalFetch = globalThis.fetch
	const requestedUrls: string[] = []
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = input.toString()
		requestedUrls.push(url)
		// one url bounces to an internal address, one moves to another public page, and anything else is the landing page
		if (url.startsWith("https://public.example/bounce")) {
			return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })
		}
		if (url.startsWith("https://public.example/moved")) {
			return new Response(null, { status: 301, headers: { location: "https://public.example/landed" } })
		}
		return new Response("public body")
	}) as typeof fetch

	try {
		// a page that redirects inward throws an error, and the internal address is never requested
		await expect(fetchPublicUrl("https://public.example/bounce")).rejects.toThrow(/is an internal address/)
		expect(requestedUrls).not.toContain("http://169.254.169.254/latest/meta-data")

		// a redirect to another public page is still followed, so ordinary moved feeds keep working
		const response = await fetchPublicUrl("https://public.example/moved")
		expect(await response.text()).toBe("public body")
		expect(requestedUrls).toContain("https://public.example/landed")
	} finally {
		globalThis.fetch = originalFetch
	}
})
