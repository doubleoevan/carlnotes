// tests for the rules that decide whether a request is served by the api, a client file, the ui's server, or a 404
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CHAT_HISTORY_TURNS, CHAT_QUESTION_CHARS } from "@shared/contracts"
import * as monitoring from "@shared/monitoring"
import { connectionPool } from "../db"
import { PROVIDER_PHOTO_ORIGINS } from "./avatars"
import server from "./index"

// the page the fake server entry renders the one-hashed client asset and its text, and the docs 404 page
const PAGE_HTML = "<!doctype html><title>carl</title>"
const HASHED_ASSET_PATH = "/assets/app-abc123.js"
const HASHED_ASSET_TEXT = "console.log(1)"
const DOCS_NOT_FOUND_HTML = "<!doctype html><title>docs page not found</title>"

// serveStatic resolves its root against the working directory, so a test selects its bundle by moving there
async function withWorkingDirectory<T>(directory: string, run: () => Promise<T>): Promise<T> {
	const originalDirectory = process.cwd()
	process.chdir(directory)

	// restore on the way out however the run ends
	try {
		return await run()
	} finally {
		process.chdir(originalDirectory)
	}
}

// a fake directory with a bundle shaped like the one build:ui writes: one hashed client asset, and a server entry
// that responds to every page request with PAGE_HTML
async function createBundleDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "carl-bundle-"))
	await mkdir(join(root, "ui/dist/client/assets"), { recursive: true })
	await mkdir(join(root, "ui/dist/server"), { recursive: true })

	// write the asset and the server entry
	await writeFile(join(root, `ui/dist/client${HASHED_ASSET_PATH}`), HASHED_ASSET_TEXT)
	const serverEntryText = `export default { fetch: () => new Response(${JSON.stringify(PAGE_HTML)}, { headers: { "content-type": "text/html" } }) }`
	await writeFile(join(root, "ui/dist/server/server.js"), serverEntryText)
	return root
}

// the status, body, and headers the composed app returned for a request
type ResponseSnapshot = {
	status: number
	body: string
	cacheControl: string | null
	contentType: string | null
	location: string | null
}

// a request against the composed app, exactly as the runtime would deliver it
async function request(path: string, method = "GET"): Promise<ResponseSnapshot> {
	const response = await server.fetch(new Request(`http://localhost:3000${path}`, { method }))
	return {
		status: response.status,
		body: await response.text(),
		cacheControl: response.headers.get("Cache-Control"),
		contentType: response.headers.get("Content-Type"),
		location: response.headers.get("Location"),
	}
}

// a request sent with the pool's query swapped for a stub that counts its calls.
// the pool's own query comes back however the request ends
async function requestWithQueryStub(
	path: string,
	queryStub: () => Promise<unknown>,
): Promise<ResponseSnapshot & { queryCount: number }> {
	const poolQuery = connectionPool.query
	let queryCount = 0
	connectionPool.query = (() => {
		queryCount += 1
		return queryStub()
	}) as typeof connectionPool.query

	// restore the pool's own query on the way out
	try {
		return { ...(await request(path)), queryCount }
	} finally {
		connectionPool.query = poolQuery
	}
}

// the result a trivial query returns
const SELECT_ONE_RESULT = { rows: [{ "?column?": 1 }], fields: [], rowCount: 1, command: "SELECT" }

// put each spied console method back after each test, whether its assertions pass or not
afterEach(() => {
	mock.restore()
})

// the platform polls the health route to decide whether to cycle the container,
// so the route responds from the process alone
test("the health route responds without reaching the database", async () => {
	const response = await requestWithQueryStub("/api/health", () => Promise.resolve(SELECT_ONE_RESULT))
	expect(response.status).toBe(200)
	expect(JSON.parse(response.body)).toEqual({ status: "ok" })
	expect(response.queryCount).toBe(0)
})

// a monitor polls the deep health check to learn that the database responds, and never reads a cached result
test("the deep health check runs one query and responds with the pool's counts", async () => {
	const response = await requestWithQueryStub("/api/health/deep", () => Promise.resolve(SELECT_ONE_RESULT))
	expect(response.status).toBe(200)
	expect(response.cacheControl).toBe("no-store")
	expect(response.queryCount).toBe(1)

	// the query's latency and the pool's three counts
	expect(JSON.parse(response.body)).toEqual({
		status: "ok",
		databaseLatencyMs: expect.any(Number),
		pool: { totalCount: expect.any(Number), idleCount: expect.any(Number), waitingCount: expect.any(Number) },
	})
})

// a database that fails makes the deep health check fail, so a monitor alerts
test("the deep health check responds 503 when the database fails", async () => {
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const response = await requestWithQueryStub("/api/health/deep", () => Promise.reject(new Error("connection refused")))

	// the failure is logged, and the response says the database is unavailable
	expect(response.status).toBe(503)
	expect(response.cacheControl).toBe("no-store")
	expect(JSON.parse(response.body)).toMatchObject({ status: "unavailable" })
	expect(consoleErrorSpy).toHaveBeenCalled()
})

// a route whose query fails, as one does after waiting past the pool's timeout, responds 500 and reports the error
test("an error no route handles responds 500 and is reported", async () => {
	spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const poolTimeout = new Error("timeout exceeded when trying to connect")
	const response = await requestWithQueryStub("/api/topic-feed", () => Promise.reject(poolTimeout))

	// Hono's plain 500, and one report of drizzle's query error, whose cause is the pool's timeout
	expect(response.status).toBe(500)
	expect(response.body).toBe("Internal Server Error")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ cause: poolTimeout }), "api-route")
})

// a missing endpoint must stay an api failure a fetch client can read
test("an unknown api path responds with a json 404, never a page", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/does-not-exist"))

	// a JSON body with the same error shape every other api route uses
	expect(response.status).toBe(404)
	expect(response.contentType).toContain("application/json")
	expect(JSON.parse(response.body)).toEqual({ error: "not found" })
})

// a deep link is not a file, so the ui's server renders it
test("a page path is rendered by the ui's server", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123"))

	// the page revalidates, so a deploy reaches the user on their next request
	expect(response.status).toBe(200)
	expect(response.body).toBe(PAGE_HTML)
	expect(response.cacheControl).toBe("no-cache")
})

// a HEAD request for a page renders it like a GET and returns the headers without the body
test("a HEAD request for a page path responds with the page's headers and no body", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123", "HEAD"))

	expect(response.status).toBe(200)
	expect(response.body).toBe("")
	expect(response.cacheControl).toBe("no-cache")
})

// a page has one url, so the same path with a trailing slash redirects to it and keeps its query
test("a page url ending in a slash redirects permanently to the url without it", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/?popular=2"))

	expect(response.status).toBe(301)
	expect(response.location).toBe("/topics?popular=2")
})

// a path that starts with two slashes still redirects to a path on this site, never to another host
test("a slash redirect never leaves the site", async () => {
	const bundleDirectory = await createBundleDirectory()
	const locations = await withWorkingDirectory(bundleDirectory, async () =>
		Promise.all(["//evil.com/", "//"].map(async (slashedPath) => (await request(slashedPath)).location)),
	)

	expect(locations).toEqual(["/evil.com", "/"])
})

// security.txt is for a researcher, so a search engine leaves it out of its results
test("security.txt is served with a noindex header", async () => {
	const response = await server.fetch(new Request("http://localhost:3000/.well-known/security.txt"))

	expect(response.status).toBe(200)
	expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
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
	await mkdir(join(bundleDirectory, "docs/dist"), { recursive: true })
	await writeFile(join(bundleDirectory, "docs/dist/404.html"), DOCS_NOT_FOUND_HTML)
	const response = await withWorkingDirectory(bundleDirectory, () => request("/docs/no-such-page"))

	// the docs 404 page with a 404 status
	expect(response.status).toBe(404)
	expect(response.body).toContain(DOCS_NOT_FOUND_HTML)
	expect(response.body).not.toBe(PAGE_HTML)
})

// the fallback is for reads. a write to a path nothing handles is a 404, not a page
test("a write to an unknown path responds 404, never a page", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123", "POST"))

	expect(response.status).toBe(404)
	expect(response.body).not.toBe(PAGE_HTML)
})

// the question is validated before the handler runs
test("a chat turn with no question is rejected before any work", async () => {
	const response = await server.fetch(
		new Request("http://localhost:3000/api/topics/abc123/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ question: "   " }),
		}),
	)
	expect(response.status).toBe(400)
})

// a question longer that the limit is rejected, so that one request cannot inflate the retrieval or the prompt
test("an oversized chat question is rejected", async () => {
	const response = await server.fetch(
		new Request("http://localhost:3000/api/topics/abc123/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ question: "x".repeat(CHAT_QUESTION_CHARS + 1) }),
		}),
	)
	expect(response.status).toBe(400)
})

// the chat history is sent by the api client, so its depth is limited before it can inflate the token bill
test("an oversized chat history is rejected", async () => {
	const history = Array.from({ length: CHAT_HISTORY_TURNS + 1 }, () => ({ question: "q", answer: "a" }))
	const response = await server.fetch(
		new Request("http://localhost:3000/api/topics/abc123/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ question: "what is new?", history }),
		}),
	)
	expect(response.status).toBe(400)
})

// dev runs the api with no bundle, where vite serves the ui and proxies /api. the 404 must say why
test("a missing bundle responds with a 404 instead of failing", async () => {
	const emptyDirectory = await mkdtemp(join(tmpdir(), "carl-no-bundle-"))
	const response = await withWorkingDirectory(emptyDirectory, () => request("/"))

	expect(response.status).toBe(404)
	expect(response.body).toContain("build:ui")
})

// a bundle that throws on import is a broken deploy, not a missing build, so the page asks a crawler to retry
test("a bundle that fails to import responds 503", async () => {
	const bundleDirectory = await createBundleDirectory()
	await writeFile(join(bundleDirectory, "ui/dist/server/server.js"), 'throw new Error("a broken bundle")')
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123"))

	expect(response.status).toBe(503)
	expect(response.body).not.toBe(PAGE_HTML)
})

// an oauth avatar redirects to its provider, so the policy has to allow that origin
test("the content security policy allows every provider photo host the avatar redirect points at", async () => {
	const response = await server.fetch(new Request("http://localhost:3000/api/health"))
	const imageSources = response.headers.get("Content-Security-Policy")?.split(";")[0] ?? ""
	for (const photoOrigin of PROVIDER_PHOTO_ORIGINS) {
		expect(imageSources).toContain(photoOrigin)
	}
})
