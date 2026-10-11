// page guard tests: the slash and per-click redirects, and the render limit that sheds a visitor's render past it
import { afterEach, expect, mock, test } from "bun:test"
import { restoreEnv } from "@shared/testEnv"
import { RENDERED_EDGE_CACHE_CONTROL } from "./edgeCache"
import { createBundleDirectory, request, withWorkingDirectory } from "./indexTestFixtures"

// put each spy back after each test
afterEach(() => {
	mock.restore()
})

// a page has one url, so the same path with a trailing slash redirects to it and keeps its query
test("a page url ending in a slash redirects permanently to the url without it", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/plans/?popular=2"))

	expect(response.status).toBe(301)
	expect(response.location).toBe("/plans?popular=2")
})

// a path that starts with two slashes still redirects to a path on this site, never to another host
test("a slash redirect never leaves the site", async () => {
	const bundleDirectory = await createBundleDirectory()
	const locations = await withWorkingDirectory(bundleDirectory, async () =>
		Promise.all(["//evil.com/", "//"].map(async (slashedPath) => (await request(slashedPath)).location)),
	)

	expect(locations).toEqual(["/evil.com", "/"])
})

// a shared link includes a per-click id, and every distinct id would be its own edge cache entry, so the page
// redirects to the url without it and keeps the campaign parameters that name the visit's source
test("a page url with a per-click id redirects to the url without it, keeping its campaign parameters", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () =>
		request("/topics/abc123?fbclid=IwAR1&utm_source=newsletter&gclid=2"),
	)

	// a visitor's permanent redirect is shared at the edge like the page it points at
	expect(response.status).toBe(301)
	expect(response.location).toBe("/topics/abc123?utm_source=newsletter")
	expect(response.cacheControl).toBe("no-cache")
	expect(response.edgeCacheControl).toBe(RENDERED_EDGE_CACHE_CONTROL)
})

// the blog and release pages render at the origin too, so a per-click id redirects away before their routes run
test("a blog or release page url with a per-click id redirects to the url without it", async () => {
	const bundleDirectory = await createBundleDirectory()
	const locations = await withWorkingDirectory(bundleDirectory, async () =>
		Promise.all(
			["/blog?fbclid=1", "/releases/v1.2.0?gclid=2&ref=x"].map(async (path) => (await request(path)).location),
		),
	)

	expect(locations).toEqual(["/blog", "/releases/v1.2.0?ref=x"])
})

// a path that starts with two slashes would read as another host in a Location header, so the per-click redirect
// collapses the leading slashes and stays on this site
test("a per-click redirect never leaves the site", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("//evil.com?fbclid=1&x=2"))

	expect(response.status).toBe(301)
	expect(response.location).toBe("/evil.com?x=2")
})

// a visitor's render past the concurrency limit is shed privately with a short retry, while the edge serves its stale
// copy, and a signed-in render is never shed
test("a visitor's render past the limit responds 503 with a retry, and a signed-in render is not", async () => {
	const originalRenderConcurrency = Bun.env.RENDER_CONCURRENCY
	Bun.env.RENDER_CONCURRENCY = "1"

	// two visitor renders and a signed-in render at once against a bundle that takes a moment to render
	try {
		const bundleDirectory = await createBundleDirectory(50)
		const [firstResponse, secondResponse, signedInResponse] = await withWorkingDirectory(bundleDirectory, () =>
			Promise.all([
				request("/topics/abc123"),
				request("/topics/def456"),
				request("/topics/ghi789", { headers: { cookie: "better-auth.session_token=abc" } }),
			]),
		)

		// one visitor render runs, the other is shed with a two-second retry, and the signed-in one renders
		expect([firstResponse.status, secondResponse.status].sort()).toEqual([200, 503])
		const shedResponse = firstResponse.status === 503 ? firstResponse : secondResponse
		expect(shedResponse.retryAfter).toBe("2")
		expect(shedResponse.cacheControl).toBe("private, no-cache")
		expect(signedInResponse.status).toBe(200)
	} finally {
		// put the limit back
		restoreEnv("RENDER_CONCURRENCY", originalRenderConcurrency)
	}
})

// only a visitor's render counts against the limit, so signed-in renders in flight never shed a visitor
test("a signed-in render in flight does not count against the visitors' limit", async () => {
	const originalRenderConcurrency = Bun.env.RENDER_CONCURRENCY
	Bun.env.RENDER_CONCURRENCY = "1"

	// a slow signed-in render and a visitor render at once
	try {
		const bundleDirectory = await createBundleDirectory(50)
		const [signedInResponse, visitorResponse] = await withWorkingDirectory(bundleDirectory, () =>
			Promise.all([
				request("/topics/abc123", { headers: { cookie: "better-auth.session_token=abc" } }),
				request("/topics/def456"),
			]),
		)

		// both render
		expect([signedInResponse.status, visitorResponse.status]).toEqual([200, 200])
	} finally {
		// put the limit back
		restoreEnv("RENDER_CONCURRENCY", originalRenderConcurrency)
	}
})
