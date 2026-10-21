// the fixtures the page serving tests share: a fake ui bundle, a request against the composed app, and a stubbed
// pool. only tests import it
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import server from "./index"

// the page the fake server entry renders, the one hashed client asset and its text, the public file's text, and the
// docs 404 page
export const PAGE_HTML = "<!doctype html><title>carl</title>"
export const HASHED_ASSET_PATH = "/assets/app-abc123.js"
export const HASHED_ASSET_TEXT = "console.log(1)"
export const PUBLIC_FILE_TEXT = "User-agent: *"
export const DOCS_NOT_FOUND_HTML = "<!doctype html><title>docs page not found</title>"

/**
 * Runs a request with the working directory moved to a bundle's directory, which serveStatic resolves its root against,
 * and moves it back however the run ends.
 */
export async function withWorkingDirectory<T>(directory: string, run: () => Promise<T>): Promise<T> {
	const originalDirectory = process.cwd()
	process.chdir(directory)

	// restore on the way out however the run ends
	try {
		return await run()
	} finally {
		process.chdir(originalDirectory)
	}
}

// the temporary directories the tests created, removed after each test
const testDirectories: string[] = []

/**
 * Creates an empty temporary directory that removeTestDirectories removes.
 */
export async function createTestDirectory(prefix: string): Promise<string> {
	const testDirectory = await mkdtemp(join(tmpdir(), prefix))
	testDirectories.push(testDirectory)
	return testDirectory
}

/**
 * Removes every temporary directory the tests created.
 */
export async function removeTestDirectories(): Promise<void> {
	const removedDirectories = testDirectories.splice(0)
	await Promise.all(removedDirectories.map((testDirectory) => rm(testDirectory, { recursive: true, force: true })))
}

// how long the fake server entry takes to render a page, and how many of its first renders throw an error
export type CreateBundleDirectoryOptions = { renderDelayMs?: number; failingRenderCount?: number }

/**
 * Creates a fake directory with a bundle shaped like the one build:ui writes, whose server entry renders PAGE_HTML.
 */
export async function createBundleDirectory({
	renderDelayMs = 0,
	failingRenderCount = 0,
}: CreateBundleDirectoryOptions = {}): Promise<string> {
	const root = await createTestDirectory("carl-bundle-")
	await mkdir(join(root, "apps/web/dist/client/assets"), { recursive: true })
	await mkdir(join(root, "apps/web/dist/server"), { recursive: true })

	// write the asset, the public file, and the server entry
	await writeFile(join(root, `apps/web/dist/client${HASHED_ASSET_PATH}`), HASHED_ASSET_TEXT)
	await writeFile(join(root, "apps/web/dist/client/robots.txt"), PUBLIC_FILE_TEXT)
	const serverEntryText = [
		"let renderCount = 0",
		"export default { fetch: async () => {",
		`if (++renderCount <= ${failingRenderCount}) { throw new Error("the render failed") }`,
		`await Bun.sleep(${renderDelayMs})`,
		`return new Response(${JSON.stringify(PAGE_HTML)}, { headers: { "content-type": "text/html" } })`,
		"} }",
	].join("\n")
	await writeFile(join(root, "apps/web/dist/server/server.js"), serverEntryText)
	return root
}

// the status, body, and headers the composed app returned for a request
export type ResponseSnapshot = {
	status: number
	body: string
	// the headers that the tests read
	cacheControl: string | null
	edgeCacheControl: string | null
	contentEncoding: string | null
	contentType: string | null
	location: string | null
	retryAfter: string | null
}

/**
 * Sends a request to the composed app, exactly as the runtime would deliver it, and returns what the tests read.
 */
export async function request(path: string, requestInit: RequestInit = {}): Promise<ResponseSnapshot> {
	const response = await server.fetch(new Request(`http://localhost:3000${path}`, requestInit))
	return {
		status: response.status,
		body: await response.text(),
		cacheControl: response.headers.get("Cache-Control"),
		edgeCacheControl: response.headers.get("CDN-Cache-Control"),
		contentEncoding: response.headers.get("Content-Encoding"),
		contentType: response.headers.get("Content-Type"),
		location: response.headers.get("Location"),
		retryAfter: response.headers.get("Retry-After"),
	}
}

// what a stubbed request sends: its path, the rows that every query returns, and any request headers.
// a toQueryRows that throws an error fails every query
export type RequestWithQueryStubOptions = {
	path: string
	toQueryRows: () => unknown[]
	requestInit?: RequestInit
}

/**
 * Sends a request with the pool's query swapped for a stub that counts its calls, and puts the pool's own query back
 * however the request ends.
 */
export async function requestWithQueryStub({
	path,
	toQueryRows,
	requestInit,
}: RequestWithQueryStubOptions): Promise<ResponseSnapshot & { queryCount: number }> {
	const sentQueries = stubConnectionPool(toQueryRows)

	// restore the pool's own query on the way out
	try {
		return { ...(await request(path, requestInit)), queryCount: sentQueries.length }
	} finally {
		restoreConnectionPool()
	}
}

// the rows that a trivial query returns
export const SELECT_ONE_ROWS = [{ "?column?": 1 }]
