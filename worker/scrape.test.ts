// scrape tests for the conditional-refetch helpers
import { expect, test } from "bun:test"
import { conditionalHeaders, revalidationOutcome, toFetchableUrl } from "./scrape"

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

// a Source or attachment url is owner-supplied, so the guard is what stops a Topic from reaching our own network
test("toFetchableUrl refuses anything not publicly routable", () => {
	// a public https url passes through as a parsed target
	expect(toFetchableUrl("https://example.com/feed.xml").hostname).toBe("example.com")

	// a scheme that is not http(s) reaches the filesystem or inline data, so it never gets fetched
	expect(() => toFetchableUrl("file:///etc/passwd")).toThrow(/http/)
	expect(() => toFetchableUrl("not a url")).toThrow(/malformed/)

	// loopback, link-local (the cloud metadata address), and the private ranges are all refused
	for (const url of [
		"http://localhost/admin",
		"http://127.0.0.1/admin",
		"http://169.254.169.254/latest/meta-data/",
		"http://10.0.0.5/",
		"http://192.168.1.1/",
		"http://172.16.0.1/",
		"http://db.internal/",
	]) {
		expect(() => toFetchableUrl(url)).toThrow(/not publicly routable/)
	}
})
