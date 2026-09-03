// public-fetch tests: the address checks, the redirect-hop pinning, and the vetted-address connection
import { expect, mock, test } from "bun:test"
import * as dnsPromises from "node:dns/promises"
import { fetchPublicUrl, isInternalAddress, toFetchableUrl } from "./publicFetch"

// the address check that stops a user-supplied url reaching our own network: internal ranges rejected, public ones allowed
test("isInternalAddress rejects loopback, private, link-local, cgnat, and their ipv6 forms", () => {
	for (const internal of [
		"127.0.0.1",
		"10.1.2.3",
		"192.168.0.1",
		"172.16.0.1",
		"169.254.169.254",
		"100.64.0.1",
		"0.0.0.0",
		"::1",
		"::ffff:127.0.0.1",
		"fd00::1",
		"fe80::1",
	]) {
		expect(isInternalAddress(internal)).toBe(true)
	}
})

test("isInternalAddress allows public addresses", () => {
	for (const external of ["93.184.216.34", "8.8.8.8", "172.15.0.1", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111"]) {
		expect(isInternalAddress(external)).toBe(false)
	}
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

// stand in for dns so the .example hosts resolve here: one to a fixed public address, one to nothing.
// every other host keeps the real resolver, so the mock cannot leak into other tests
mock.module("node:dns/promises", () => ({
	...dnsPromises,
	lookup: (host: string, options: { all: true }) => {
		if (host === "unresolved.example") {
			return Promise.resolve([])
		}
		return host.endsWith(".example")
			? Promise.resolve([{ address: "93.184.216.34", family: 4 }])
			: dnsPromises.lookup(host, options)
	},
}))

// a redirect that points inward is never fetched. fetch alone would follow it unchecked
test("fetchPublicUrl checks every redirect hop and connects to the vetted address", async () => {
	// stand in for the network so the test never leaves the machine. each path responds the way the case under test needs
	const originalFetch = globalThis.fetch
	const requestedUrls: string[] = []
	const hostHeaders: string[] = []
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(input.toString())
		requestedUrls.push(url.toString())
		hostHeaders.push(new Headers(init?.headers).get("host") ?? "")
		// one path bounces to an internal address, one moves to another public page, and anything else is the landing page
		if (url.pathname === "/bounce") {
			return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })
		}
		if (url.pathname === "/moved") {
			return new Response(null, { status: 301, headers: { location: "https://public.example/landed" } })
		}
		return new Response("public body")
	}) as typeof fetch

	try {
		// a page that redirects inward throws an error, and the internal address is never requested
		await expect(fetchPublicUrl("https://public.example/bounce")).rejects.toThrow(/is an internal address/)
		expect(requestedUrls).not.toContain("http://169.254.169.254/latest/meta-data")

		// a redirect to another public page is still followed, connecting to the resolved address with the site in the Host header
		const response = await fetchPublicUrl("https://public.example/moved")
		expect(await response.text()).toBe("public body")
		expect(requestedUrls).toContain("https://93.184.216.34/landed")
		expect(hostHeaders.every((host) => host === "public.example")).toBe(true)

		// a host the resolver cannot answer for is never fetched
		await expect(fetchPublicUrl("https://unresolved.example/page")).rejects.toThrow(/did not resolve/)
		expect(requestedUrls).not.toContain("https://unresolved.example/page")
	} finally {
		globalThis.fetch = originalFetch
	}
})
