// tests for the pages the ui's server renders: their cache headers, the slash redirect, the client and docs files,
// a missing or broken bundle, and a page rendered without a read it needs
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { DEGRADED_RENDER_HEADER } from "@carlnotes/contracts/seo"
import * as analytics from "@carlnotes/server/analytics"
import * as monitoring from "@carlnotes/server/monitoring"
import { RENDERED_EDGE_CACHE_CONTROL } from "./edgeCache"
import server from "./index"
import {
	createBundleDirectory,
	createTestDirectory,
	DOCS_NOT_FOUND_HTML,
	HASHED_ASSET_PATH,
	HASHED_ASSET_TEXT,
	PAGE_HTML,
	removeTestDirectories,
	request,
	withWorkingDirectory,
} from "./indexTestFixtures"

// put each spied console method back and remove the temporary directories after each test, whether its assertions
// pass or not
afterEach(async () => {
	mock.restore()
	await removeTestDirectories()
})

// a deep link is not a file, so the ui's server renders it
test("a page path is rendered by the ui's server", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123"))

	// the browser revalidates, so a deploy reaches the user on their next request.
	// the edge shares the page for a minute
	expect(response.status).toBe(200)
	expect(response.body).toBe(PAGE_HTML)
	expect(response.cacheControl).toBe("no-cache")
	expect(response.edgeCacheControl).toBe(RENDERED_EDGE_CACHE_CONTROL)
})

// the same url renders differently for a signed-in user, so the edge never caches their page
test("a page rendered for a session cookie is private", async () => {
	const bundleDirectory = await createBundleDirectory()
	const cookieHeaders = { cookie: "__Secure-better-auth.session_token=abc" }
	const response = await withWorkingDirectory(bundleDirectory, () =>
		request("/topics/abc123", { headers: cookieHeaders }),
	)

	expect(response.status).toBe(200)
	expect(response.cacheControl).toBe("private, no-cache")
	expect(response.edgeCacheControl).toBeNull()
})

// a HEAD request for a page renders it like a GET and returns the headers without the body
test("a HEAD request for a page path responds with the page's headers and no body", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123", { method: "HEAD" }))

	expect(response.status).toBe(200)
	expect(response.body).toBe("")
	expect(response.cacheControl).toBe("no-cache")
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

// a hashed filename cannot change contents, so it is cached and never revalidated
test("a hashed asset is cached immutably", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request(HASHED_ASSET_PATH))

	// the asset's own bytes as javascript, cached for a year
	expect(response.status).toBe(200)
	expect(response.contentType).toContain("javascript")
	expect(response.body).toBe(HASHED_ASSET_TEXT)
	expect(response.cacheControl).toBe("public, max-age=31536000, immutable")
})

// a docs path matching no built file gets the docs site's own 404 page, never the ui's page
test("an unknown docs path responds with the docs 404 page", async () => {
	const bundleDirectory = await createBundleDirectory()
	await mkdir(join(bundleDirectory, "apps/docs/dist"), { recursive: true })
	await writeFile(join(bundleDirectory, "apps/docs/dist/404.html"), DOCS_NOT_FOUND_HTML)
	const response = await withWorkingDirectory(bundleDirectory, () => request("/docs/no-such-page"))

	// the docs 404 page with a 404 status
	expect(response.status).toBe(404)
	expect(response.body).toContain(DOCS_NOT_FOUND_HTML)
	expect(response.body).not.toBe(PAGE_HTML)
})

// dev runs the api with no bundle, where vite serves the ui and proxies /api. the 404 must say why
test("a missing bundle responds with a 404 instead of failing", async () => {
	const emptyDirectory = await createTestDirectory("carl-no-bundle-")
	const response = await withWorkingDirectory(emptyDirectory, () => request("/"))

	expect(response.status).toBe(404)
	expect(response.body).toContain("build:ui")
})

// a known crawler's page fetch is reported by the route's shape. its asset fetch and an unknown agent's page fetch
// report nothing
test("a crawler's page fetch is reported, and an asset or an unknown agent is not", async () => {
	const trackBotEventSpy = spyOn(analytics, "trackBotEvent").mockImplementation(() => {})
	const bundleDirectory = await createBundleDirectory()
	const googlebotHeaders = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }
	// the crawler's page and asset, then a browser's page
	await withWorkingDirectory(bundleDirectory, async () => {
		await request("/topics/abc123/espresso", { headers: googlebotHeaders })
		await request(HASHED_ASSET_PATH, { headers: googlebotHeaders })
		await request("/topics/abc123/espresso", { headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120" } })
	})
	expect(trackBotEventSpy.mock.calls).toEqual([
		[
			"crawler_fetched",
			"googlebot",
			{ entryPoint: "web", botName: "googlebot", routeShape: "/topics/:id/:slug", status: 200 },
		],
	])
})

// a bundle that throws on import is a broken deploy, not a missing build, so the page asks a crawler to retry
test("a bundle that fails to import responds 503", async () => {
	const bundleDirectory = await createBundleDirectory()
	await writeFile(join(bundleDirectory, "apps/web/dist/server/server.js"), 'throw new Error("a broken bundle")')
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123"))

	expect(response.status).toBe(503)
	expect(response.body).not.toBe(PAGE_HTML)
})

// a page rendered without a read it needs asks a crawler to retry, and the edge keeps no copy of it
test("a page rendered without a read it needs responds 503 with no edge copy", async () => {
	// a server entry whose page says a read failed, and the report it sends
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const bundleDirectory = await createBundleDirectory()
	const degradedServerEntryText = `export default { fetch: () => new Response(${JSON.stringify(PAGE_HTML)}, { headers: { "content-type": "text/html", "${DEGRADED_RENDER_HEADER}": "1" } }) }`
	await writeFile(join(bundleDirectory, "apps/web/dist/server/server.js"), degradedServerEntryText)
	const response = await withWorkingDirectory(bundleDirectory, async () =>
		server.fetch(new Request("http://localhost:3000/topics/abc123")),
	)

	// the page still renders, as a private 503 with a retry time and without the header
	expect(response.status).toBe(503)
	expect(await response.text()).toBe(PAGE_HTML)
	expect(response.headers.get("Cache-Control")).toBe("private, no-cache")
	expect(response.headers.get("CDN-Cache-Control")).toBeNull()
	expect(response.headers.get("Retry-After")).toBe("60")
	expect(response.headers.has(DEGRADED_RENDER_HEADER)).toBe(false)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "page-render", { path: "/topics/abc123" })
})
