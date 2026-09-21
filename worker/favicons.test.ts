// favicon tests: the month-long rule, the candidate order, a failed refetch that keeps the stored icon, and the size
// limit and the ico and svg types a favicon fetch adds to the image rules
import { expect, mock, test } from "bun:test"
import * as dnsPromises from "node:dns/promises"
import {
	FAVICON_IMAGE_TYPES,
	FAVICON_TTL_MS,
	isFaviconFetchDue,
	MAX_FAVICON_BYTES,
	toFaviconCandidateUrls,
	toFaviconFields,
} from "./favicons"
import { fetchLinkPreviewImage } from "./linkPreview"

// stand in for dns so the .example host resolves here to a fixed public address, and no other host is touched
mock.module("node:dns/promises", () => ({
	...dnsPromises,
	lookup: (host: string, options: { all: true }) =>
		host.endsWith(".example")
			? Promise.resolve([{ address: "93.184.216.34", family: 4 }])
			: dnsPromises.lookup(host, options),
}))

// a host never fetched is due now, and a fetched one is due again only once the ttl has passed
test("a host's icon is due once a month", () => {
	const now = new Date("2026-09-20T12:00:00Z")
	expect(isFaviconFetchDue(null, now)).toBe(true)
	expect(isFaviconFetchDue(new Date(now.getTime() - FAVICON_TTL_MS + 1), now)).toBe(false)
	expect(isFaviconFetchDue(new Date(now.getTime() - FAVICON_TTL_MS - 1), now)).toBe(true)
})

// the root icon comes first, then the page's own, then the root svg and touch icon, then the www or bare sibling's
// three, and a page naming a root icon adds nothing
test("toFaviconCandidateUrls tries the root icon, the named icon, the root svg and touch icon, then the sibling's", () => {
	expect(toFaviconCandidateUrls("news.example", "https://cdn.example/icon.png")).toEqual([
		"https://news.example/favicon.ico",
		"https://cdn.example/icon.png",
		"https://news.example/favicon.svg",
		"https://news.example/apple-touch-icon.png",
		"https://www.news.example/favicon.ico",
		"https://www.news.example/favicon.svg",
		"https://www.news.example/apple-touch-icon.png",
	])
	expect(toFaviconCandidateUrls("www.news.example", "https://www.news.example/favicon.svg")).toEqual([
		"https://www.news.example/favicon.ico",
		"https://www.news.example/favicon.svg",
		"https://www.news.example/apple-touch-icon.png",
		"https://news.example/favicon.ico",
		"https://news.example/favicon.svg",
		"https://news.example/apple-touch-icon.png",
	])
	expect(toFaviconCandidateUrls("news.example", null)).toHaveLength(6)
})

// a failed refetch keeps the icon already stored, and a failed first fetch stores nothing
test("toFaviconFields keeps a stored icon through a failed fetch", () => {
	const now = new Date("2026-09-21T12:00:00Z")
	const storedFavicon = { objectKey: "favicons/news.example", contentType: "image/png" }
	expect(toFaviconFields("news.example", storedFavicon, null, now)).toEqual({ ...storedFavicon, fetchedAt: now })
	expect(toFaviconFields("news.example", undefined, null, now)).toEqual({
		objectKey: null,
		contentType: null,
		fetchedAt: now,
	})
	const fetchedFavicon = { bytes: new Uint8Array(8), contentType: "image/x-icon" }
	expect(toFaviconFields("news.example", storedFavicon, fetchedFavicon, now)).toEqual({
		objectKey: "favicons/news.example",
		contentType: "image/x-icon",
		fetchedAt: now,
	})
})

// the favicon types add ico and svg to the link preview types, and the favicon limit rejects an icon the link preview limit would have kept
test("a favicon fetch keeps a small png, an ico, and an svg and rejects an oversized icon", async () => {
	// stand in for the network. the path names the body served
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async (input: string | URL | Request) => {
		const { pathname } = new URL(input.toString())
		if (pathname === "/icon.svg") {
			return new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } })
		}
		// an ico, the type most sites still serve their icon in
		if (pathname === "/favicon.ico") {
			return new Response(new Uint8Array(512), { headers: { "content-type": "image/x-icon" } })
		}
		// a png of the size the path asks for
		const byteCount = pathname === "/big.png" ? MAX_FAVICON_BYTES + 1 : 512
		return new Response(new Uint8Array(byteCount), { headers: { "content-type": "image/png" } })
	}) as typeof fetch

	try {
		// the small png and the ico come back as sent
		const png = await fetchLinkPreviewImage("https://icons.example/icon.png", MAX_FAVICON_BYTES, FAVICON_IMAGE_TYPES)
		expect(png.contentType).toBe("image/png")
		expect(png.bytes.byteLength).toBe(512)
		const ico = await fetchLinkPreviewImage("https://icons.example/favicon.ico", MAX_FAVICON_BYTES, FAVICON_IMAGE_TYPES)
		expect(ico.contentType).toBe("image/x-icon")

		const svg = await fetchLinkPreviewImage("https://icons.example/icon.svg", MAX_FAVICON_BYTES, FAVICON_IMAGE_TYPES)
		expect(svg.contentType).toBe("image/svg+xml")

		// one past the favicon limit is rejected
		await expect(
			fetchLinkPreviewImage("https://icons.example/big.png", MAX_FAVICON_BYTES, FAVICON_IMAGE_TYPES),
		).rejects.toThrow(/exceeds/)

		// a link preview image fetch keeps its own types, so an ico and an svg are still no preview image
		await expect(fetchLinkPreviewImage("https://icons.example/favicon.ico")).rejects.toThrow(/x-icon/)
		await expect(fetchLinkPreviewImage("https://icons.example/icon.svg")).rejects.toThrow(/svg/)
	} finally {
		globalThis.fetch = originalFetch
	}
})
