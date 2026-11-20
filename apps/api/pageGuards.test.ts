// page guard tests: the click id redirect, the render limit that sheds a visitor's render past it with a page that
// retries, and the minute's counts of the renders started and shed
import { afterEach, expect, mock, test } from "bun:test"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toRenderShedCrossings } from "./apiGauges"
import { RENDERED_EDGE_CACHE_CONTROL } from "./edgeCache"
import server from "./index"
import { createBundleDirectory, removeTestDirectories, request, withWorkingDirectory } from "./indexTestFixtures"
import { SESSION_COOKIE } from "./testSession"
import {
	BUSY_RENDER_MAX_RETRY_AFTER_SECONDS,
	BUSY_RENDER_MIN_RETRY_AFTER_SECONDS,
	readAndResetRenderGauges,
} from "./uiServer"

// put each spy and the render limit back, and remove the temporary directories after each test
const restoreEnvSettings = saveEnvSettings(["RENDER_CONCURRENCY"])
afterEach(async () => {
	mock.restore()
	restoreEnvSettings()
	await removeTestDirectories()
})

// a shared link includes a click id, and every distinct id would be its own edge cache entry, so the page
// redirects to the url without it and keeps the campaign parameters that name the visit's source
test("a page url with a click id redirects to the url without it, keeping its campaign parameters", async () => {
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

// the blog and release pages render at the origin too, so a click id redirects away before their routes run
test("a blog or release page url with a click id redirects to the url without it", async () => {
	const bundleDirectory = await createBundleDirectory()
	const locations = await withWorkingDirectory(bundleDirectory, async () =>
		Promise.all(
			["/blog?fbclid=1", "/releases/v1.2.0?gclid=2&ref=x"].map(async (path) => (await request(path)).location),
		),
	)

	expect(locations).toEqual(["/blog", "/releases/v1.2.0?ref=x"])
})

// a path that starts with two slashes would read as another host in a Location header, so the click id redirect
// collapses the leading slashes and stays on this site
test("a click id redirect never leaves the site", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("//evil.com?fbclid=1&x=2"))

	expect(response.status).toBe(301)
	expect(response.location).toBe("/evil.com?x=2")
})

// a visitor's render past the concurrency limit is shed privately with a short retry, while the edge serves its stale
// copy, and a signed-in render is never shed
test("a visitor's render past the limit responds 503 with a retry, and a signed-in render is not", async () => {
	// two visitor renders and a signed-in render at once against a bundle that takes a moment to render
	Bun.env.RENDER_CONCURRENCY = "1"
	const bundleDirectory = await createBundleDirectory({ renderDelayMs: 50 })
	const [firstResponse, secondResponse, signedInResponse] = await withWorkingDirectory(bundleDirectory, () =>
		Promise.all([
			request("/topics/abc123"),
			request("/topics/def456"),
			request("/topics/ghi789", { headers: { cookie: SESSION_COOKIE } }),
		]),
	)

	// one visitor render runs, the other is shed with a retry of two to six seconds, and the signed-in one renders
	expect([firstResponse.status, secondResponse.status].sort()).toEqual([200, 503])
	const shedResponse = firstResponse.status === 503 ? firstResponse : secondResponse
	expect(shedResponse.cacheControl).toBe("private, no-cache")
	expect(signedInResponse.status).toBe(200)

	// the retry wait is a whole number of seconds within the jitter range
	const retryAfterSeconds = Number(shedResponse.retryAfter)
	expect(Number.isInteger(retryAfterSeconds)).toBe(true)
	expect(retryAfterSeconds).toBeGreaterThanOrEqual(BUSY_RENDER_MIN_RETRY_AFTER_SECONDS)
	expect(retryAfterSeconds).toBeLessThanOrEqual(BUSY_RENDER_MAX_RETRY_AFTER_SECONDS)
})

// a bare line of text told a visitor nothing and never tried again, and a shed render was counted nowhere
test("a shed visitor gets a page that retries after its Retry-After wait, and the minute counts the renders started and shed", async () => {
	// start the minute's counts over, then shed one of two visitor renders beside a signed-in render
	Bun.env.RENDER_CONCURRENCY = "1"
	readAndResetRenderGauges()
	const bundleDirectory = await createBundleDirectory({ renderDelayMs: 50 })
	const responses = await withWorkingDirectory(bundleDirectory, () =>
		Promise.all([
			server.fetch(new Request("http://localhost/topics/abc123")),
			server.fetch(new Request("http://localhost/topics/def456")),
			server.fetch(new Request("http://localhost/topics/ghi789", { headers: { cookie: SESSION_COOKIE } })),
		]),
	)

	// the shed response is an html page that names the site and asks for the same address again after the same wait
	// as its Retry-After header
	const shedResponse = responses.find((response) => response.status === 503)
	const shedPage = (await shedResponse?.text()) ?? ""
	expect(shedResponse?.headers.get("content-type")).toBe("text/html; charset=utf-8")
	expect(shedPage).toStartWith("<!doctype html>")
	expect(shedPage).toContain(`<meta http-equiv="refresh" content="${shedResponse?.headers.get("retry-after")}">`)
	expect(shedPage).toContain("<h1>CarlNotes is busy</h1>")
	expect(shedPage).not.toContain("<script")

	// the minute started two renders and shed one, which crosses the render-shed threshold, and the counts start over
	const renderGauges = readAndResetRenderGauges()
	expect(renderGauges).toEqual({ startedCount: 2, shedCount: 1 })
	expect(toRenderShedCrossings(renderGauges)).toEqual([
		{
			condition: "render-shed",
			message: "a replica shed visitor page renders past its render limit",
			values: { startedCount: 2, shedCount: 1 },
		},
	])
	expect(readAndResetRenderGauges()).toEqual({ startedCount: 0, shedCount: 0 })
	expect(toRenderShedCrossings({ startedCount: 40, shedCount: 0 })).toEqual([])
})

// only a visitor's render counts against the limit, so signed-in renders in progress never shed a visitor
test("a signed-in render in progress does not count against the visitors' limit", async () => {
	// a slow signed-in render and a visitor render at once
	Bun.env.RENDER_CONCURRENCY = "1"
	const bundleDirectory = await createBundleDirectory({ renderDelayMs: 50 })
	const [signedInResponse, visitorResponse] = await withWorkingDirectory(bundleDirectory, () =>
		Promise.all([request("/topics/abc123", { headers: { cookie: SESSION_COOKIE } }), request("/topics/def456")]),
	)

	// both render
	expect([signedInResponse.status, visitorResponse.status]).toEqual([200, 200])
})

// a render that throws still releases its count, so a failed render never sheds the next visitor
test("a visitor's render that throws releases its count for the next visitor", async () => {
	// a bundle whose first render throws, with one render allowed at a time and the failure's report quiet
	Bun.env.RENDER_CONCURRENCY = "1"
	quietErrorReports()
	const bundleDirectory = await createBundleDirectory({ failingRenderCount: 1 })

	// the failed render responds 500, and the next visitor's render is not shed
	const [failedResponse, nextResponse] = await withWorkingDirectory(bundleDirectory, async () => [
		await request("/topics/abc123"),
		await request("/topics/def456"),
	])
	expect(failedResponse.status).toBe(500)
	expect(nextResponse.status).toBe(200)
})
