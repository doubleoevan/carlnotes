// tests for the Nightshift component browser's routes: the slash redirect, the built files with their cache headers,
// its own frame policy and noindex header, and a missing file or a missing build
import { afterEach, expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { NIGHTSHIFT_BUNDLE_ROOT } from "./bundlePaths"
import { FRAME_SOURCE_DIRECTIVE } from "./contentSecurityPolicy"
import { IMMUTABLE_CACHE_CONTROL, REVALIDATE_CACHE_CONTROL } from "./edgeCache"
import { createTestDirectory, removeTestDirectories, request, withWorkingDirectory } from "./indexTestFixtures"
import { NIGHTSHIFT_CONTENT_SECURITY_POLICY } from "./nightshift"

// the built files a fake Storybook build holds, by their path in the output folder
const BUILT_FILES = {
	"index.html": "<!doctype html><title>Nightshift</title>",
	"iframe.html": "<!doctype html><title>preview</title>",
	"index.json": '{"v":5,"entries":{}}',
	"assets/iframe-B2xT9kQa.js": "console.log('preview')",
	"sb-manager/runtime.js": "console.log('manager')",
}

// remove the temporary directories after each test, whether its assertions pass or not
afterEach(async () => {
	await removeTestDirectories()
})

// a directory holding a fake Storybook build where build:storybook writes it
async function createNightshiftDirectory(): Promise<string> {
	const root = await createTestDirectory("carl-nightshift-")
	const outputFolder = join(root, NIGHTSHIFT_BUNDLE_ROOT)
	await mkdir(join(outputFolder, "assets"), { recursive: true })
	await mkdir(join(outputFolder, "sb-manager"), { recursive: true })
	await Promise.all(
		Object.entries(BUILT_FILES).map(([filePath, fileText]) => writeFile(join(outputFolder, filePath), fileText)),
	)
	return root
}

// the component browser's files name each other by relative urls, so the folder needs its slash
test("/nightshift redirects permanently to /nightshift/", async () => {
	const response = await withWorkingDirectory(await createNightshiftDirectory(), () => request("/nightshift"))

	expect(response.status).toBe(301)
	expect(response.location).toBe("/nightshift/")
})

// a link to a story keeps its query through the redirect
test("/nightshift keeps its query through the redirect", async () => {
	const response = await withWorkingDirectory(await createNightshiftDirectory(), () =>
		request("/nightshift?path=/docs/nightshift-tokens--docs"),
	)

	expect(response.status).toBe(301)
	expect(response.location).toBe("/nightshift/?path=/docs/nightshift-tokens--docs")
})

// the manager page revalidates, frames its own preview, and stays out of search results
test("/nightshift/ serves the manager page with its own policy and noindex", async () => {
	const response = await withWorkingDirectory(await createNightshiftDirectory(), () => request("/nightshift/"))

	expect(response.status).toBe(200)
	expect(response.body).toBe(BUILT_FILES["index.html"])
	expect(response.cacheControl).toBe(REVALIDATE_CACHE_CONTROL)
	expect(response.edgeCacheControl).toBeNull()
	expect(response.contentSecurityPolicy).toBe(NIGHTSHIFT_CONTENT_SECURITY_POLICY)
	expect(response.crossOriginOpenerPolicy).toBe("same-origin")
	expect(response.robotsTag).toBe("noindex")
})

// a story frames what the app frames, such as the YouTube player, and another site that opens the preview gets no
// handle to post to it
test("the preview page allows the app's frame sources and is isolated from any opener", async () => {
	const response = await withWorkingDirectory(await createNightshiftDirectory(), () =>
		request("/nightshift/iframe.html"),
	)

	expect(response.status).toBe(200)
	expect(response.crossOriginOpenerPolicy).toBe("same-origin")
	expect(response.contentSecurityPolicy).toBe(NIGHTSHIFT_CONTENT_SECURITY_POLICY)
	expect(response.contentSecurityPolicy).toContain(FRAME_SOURCE_DIRECTIVE)
	expect(response.contentSecurityPolicy).toContain("https://www.youtube-nocookie.com")
	expect(response.contentSecurityPolicy).toContain("frame-ancestors 'self'")
})

// a repeat visit revalidates a fixed-name file to a 304 by its validator
test("a fixed-name file revalidates to a 304 with its validator", async () => {
	const directory = await createNightshiftDirectory()
	const firstResponse = await withWorkingDirectory(directory, () => request("/nightshift/sb-manager/runtime.js"))
	const fileEtag = firstResponse.etag
	expect(fileEtag).toBeTruthy()

	// the second request names the validator and gets headers alone
	const repeatResponse = await withWorkingDirectory(directory, () =>
		request("/nightshift/sb-manager/runtime.js", { headers: { "If-None-Match": fileEtag ?? "" } }),
	)
	expect(repeatResponse.status).toBe(304)
	expect(repeatResponse.body).toBe("")
})

// a file named by its content never changes, so the browser caches it for a year
test("a hashed preview asset is cached immutably", async () => {
	const response = await withWorkingDirectory(await createNightshiftDirectory(), () =>
		request("/nightshift/assets/iframe-B2xT9kQa.js"),
	)

	expect(response.status).toBe(200)
	expect(response.body).toBe(BUILT_FILES["assets/iframe-B2xT9kQa.js"])
	expect(response.cacheControl).toBe(IMMUTABLE_CACHE_CONTROL)
})

// the manager and the story index keep their names across builds, so a deploy must reach the browser at once
test("a fixed-name manager file and the story index revalidate", async () => {
	const nightshiftDirectory = await createNightshiftDirectory()
	const managerResponse = await withWorkingDirectory(nightshiftDirectory, () =>
		request("/nightshift/sb-manager/runtime.js"),
	)
	const indexResponse = await withWorkingDirectory(nightshiftDirectory, () => request("/nightshift/index.json"))

	expect(managerResponse.cacheControl).toBe(REVALIDATE_CACHE_CONTROL)
	expect(managerResponse.edgeCacheControl).toBeNull()
	expect(indexResponse.cacheControl).toBe(REVALIDATE_CACHE_CONTROL)
})

// a path matching no built file is the component browser's own 404, never a page the ui renders
test("a missing component browser file responds 404 with the component browser's headers", async () => {
	const response = await withWorkingDirectory(await createNightshiftDirectory(), () =>
		request("/nightshift/missing.js"),
	)

	expect(response.status).toBe(404)
	expect(response.body).toBe("Not found")
	expect(response.robotsTag).toBe("noindex")
})

// local development runs with no component browser built
test("/nightshift/ responds 404 when the component browser was never built", async () => {
	const response = await withWorkingDirectory(await createTestDirectory("carl-no-nightshift-"), () =>
		request("/nightshift/"),
	)

	expect(response.status).toBe(404)
})

// only the component browser lets its own origin frame it
test("every other response still blocks framing", async () => {
	const response = await request("/api/health")

	expect(response.contentSecurityPolicy).toContain("frame-ancestors 'none'")
})
