// tests for the readiness check: a page that renders is ready, and a missing build, a broken build, a failed render, a
// degraded render, a render that throws, and a slow render are not. against the real web build, it reads no database
// and no network
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { DEGRADED_RENDER_HEADER } from "@carlnotes/contracts/seo"
import { UI_SERVER_ENTRY } from "./bundlePaths"
import {
	createBundleDirectory,
	createTestDirectory,
	removeTestDirectories,
	request,
	requestWithQueryStub,
	withWorkingDirectory,
} from "./indexTestFixtures"

// how long the slow render test may run, past the readiness check's five seconds
const SLOW_RENDER_TIMEOUT_MS = 10 * 1000

// whether build:ui wrote the real server build, which the database-free test renders
const isWebBuildPresent = await Bun.file(resolve(UI_SERVER_ENTRY)).exists()

// put each spy back and remove the temporary directories after each test
afterEach(async () => {
	mock.restore()
	await removeTestDirectories()
})

// a build that renders the page is ready, and the response is never cached
test("readiness responds 200 if the ui's server renders the page", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/health/ready"))

	expect(response.status).toBe(200)
	expect(JSON.parse(response.body)).toEqual({ status: "ok" })
	expect(response.cacheControl).toBe("no-store")
})

// a missing build cannot render
test("readiness responds 503 if the build is missing", async () => {
	const emptyDirectory = await createTestDirectory("carl-empty-")
	const response = await withWorkingDirectory(emptyDirectory, () => request("/api/health/ready"))

	expect(response.status).toBe(503)
	expect(JSON.parse(response.body)).toEqual({ status: "unavailable", reason: "the ui's server build is missing" })
})

// a build that throws on import, as one with an undeclared package does, cannot render
test("readiness responds 503 if the build fails to import", async () => {
	// a server entry that imports a package no workspace declares, and the import error it logs
	spyOn(console, "error").mockImplementation(() => {})
	const bundleDirectory = await createBundleDirectory()
	await writeFile(join(bundleDirectory, UI_SERVER_ENTRY), 'import "an-undeclared-package"\nexport default {}\n')
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/health/ready"))

	expect(response.status).toBe(503)
	expect(JSON.parse(response.body)).toEqual({
		status: "unavailable",
		reason: "the ui's server build failed to import",
	})
})

// a render that returns anything but 200 is not ready
test("readiness responds 503 if the render returns a server error", async () => {
	const bundleDirectory = await createBundleDirectory()
	const failingServerEntryText = 'export default { fetch: () => new Response("the page failed", { status: 500 }) }'
	await writeFile(join(bundleDirectory, UI_SERVER_ENTRY), failingServerEntryText)
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/health/ready"))

	expect(response.status).toBe(503)
	expect(JSON.parse(response.body)).toEqual({ status: "unavailable", reason: "the readiness render returned 500" })
})

// a page rendered without a read it needs is not ready
test("readiness responds 503 if the render is missing a read it needs", async () => {
	const bundleDirectory = await createBundleDirectory()
	const degradedServerEntryText = `export default { fetch: () => new Response("", { headers: { "${DEGRADED_RENDER_HEADER}": "1" } }) }`
	await writeFile(join(bundleDirectory, UI_SERVER_ENTRY), degradedServerEntryText)
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/health/ready"))

	expect(response.status).toBe(503)
	expect(JSON.parse(response.body)).toEqual({
		status: "unavailable",
		reason: "the readiness render was missing a read it needs",
	})
})

// a render that throws is not ready, its error is logged, and the response holds a fixed reason
test("readiness responds 503 if the render throws", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const bundleDirectory = await createBundleDirectory({ failingRenderCount: 1 })
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/health/ready"))

	expect(response.status).toBe(503)
	expect(JSON.parse(response.body)).toEqual({ status: "unavailable", reason: "the readiness render threw an error" })
	expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
})

// a handler that throws before it returns a promise is not ready either
test("readiness responds 503 if the handler throws before it returns", async () => {
	spyOn(console, "error").mockImplementation(() => {})
	const bundleDirectory = await createBundleDirectory()
	const serverEntryText = "export default { fetch() { throw new Error('the handler failed') } }"
	await writeFile(join(bundleDirectory, UI_SERVER_ENTRY), serverEntryText)
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/health/ready"))

	expect(response.status).toBe(503)
	expect(JSON.parse(response.body)).toEqual({ status: "unavailable", reason: "the readiness render threw an error" })
})

// checks within five seconds share one render, so the second check reuses the first check's failed render
test("readiness reuses a recent render", async () => {
	spyOn(console, "error").mockImplementation(() => {})
	const bundleDirectory = await createBundleDirectory({ failingRenderCount: 1 })
	const responses = await withWorkingDirectory(bundleDirectory, async () => [
		await request("/api/health/ready"),
		await request("/api/health/ready"),
	])

	expect(responses.map((response) => response.status)).toEqual([503, 503])
})

// a render slower than five seconds is not ready
test(
	"readiness responds 503 if the render times out",
	async () => {
		const bundleDirectory = await createBundleDirectory({ renderDelayMs: 6 * 1000 })
		const response = await withWorkingDirectory(bundleDirectory, () => request("/api/health/ready"))

		expect(response.status).toBe(503)
		expect(JSON.parse(response.body)).toEqual({
			status: "unavailable",
			reason: "the readiness render took over five seconds",
		})
	},
	SLOW_RENDER_TIMEOUT_MS,
)

// the real build renders the readiness page with the network and the database failing, and a session cookie sent
test.skipIf(!isWebBuildPresent)("readiness renders the real build with no database and no network", async () => {
	// fail every outbound fetch
	spyOn(globalThis, "fetch").mockImplementation((() =>
		Promise.reject(new Error("the readiness check fetched"))) as unknown as typeof fetch)

	// fail every database query, and send a session cookie that the check never forwards
	const response = await requestWithQueryStub({
		path: "/api/health/ready",
		toQueryRows: () => {
			throw new Error("the readiness check queried the database")
		},
		requestInit: { headers: { cookie: "__Secure-better-auth.session_token=abc" } },
	})

	// the page rendered without either
	expect(JSON.parse(response.body)).toEqual({ status: "ok" })
	expect(response.status).toBe(200)
	expect(response.queryCount).toBe(0)
})
