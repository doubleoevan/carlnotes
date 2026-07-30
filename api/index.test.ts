// tests for the rules that decide whether a request is answered by the api, the ui bundle, or a 404
import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import server from "./index"

// the two bundle files the serving rules treat differently
const SHELL_HTML = "<!doctype html><title>carl</title>"
const HASHED_ASSET_PATH = "/assets/app-abc123.js"

// serveStatic resolves its root against the working directory, so a test picks its bundle by moving there.
// the directory is restored afterward, since the process is shared with every other test file
async function withWorkingDirectory<T>(directory: string, run: () => Promise<T>): Promise<T> {
	const previousDirectory = process.cwd()
	process.chdir(directory)

	// restore on the way out however the run ends
	try {
		return await run()
	} finally {
		process.chdir(previousDirectory)
	}
}

// a fake directory holding a bundle shaped like the one build:ui writes: an app shell and one hashed asset
async function makeBundleDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "carl-bundle-"))
	await mkdir(join(root, "ui/dist/assets"), { recursive: true })

	// write the shell and the asset
	await writeFile(join(root, "ui/dist/index.html"), SHELL_HTML)
	await writeFile(join(root, `ui/dist${HASHED_ASSET_PATH}`), "console.log(1)")
	return root
}

// what a request to the composed app answered with
type ResponseSnapshot = { status: number; body: string; cacheControl: string | null; contentType: string | null }

// a request against the composed app, exactly as the runtime would deliver it. the body is read here rather than
// by the caller, because serveStatic answers with a file Bun reads lazily and the directory moves back on return
async function request(path: string, method = "GET"): Promise<ResponseSnapshot> {
	const response = await server.fetch(new Request(`http://localhost:3000${path}`, { method }))
	return {
		status: response.status,
		body: await response.text(),
		cacheControl: response.headers.get("Cache-Control"),
		contentType: response.headers.get("Content-Type"),
	}
}

// the platform polls this to decide whether to cycle the container, so it must answer from the process alone.
// the suite runs with no database reachable, so a passing check here is the proof that it queries nothing
test("the health route answers without reaching the database", async () => {
	const response = await request("/api/health")
	expect(response.status).toBe(200)
	expect(JSON.parse(response.body)).toEqual({ status: "ok" })
})

// the rule the whole split rests on. a missing endpoint must stay an api failure a fetch client can read,
// never an HTML page that fails at JSON.parse and looks like a working route
test("an unknown api path answers a json 404, never the app shell", async () => {
	const bundleDirectory = await makeBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/does-not-exist"))

	// a JSON body carrying the same error shape every other api route uses
	expect(response.status).toBe(404)
	expect(response.contentType).toContain("application/json")
	expect(JSON.parse(response.body)).toEqual({ error: "not found" })
})

// a deep link is not a file, so the shell answers, and the client router resolves the path
test("an unknown page path serves the app shell", async () => {
	const bundleDirectory = await makeBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123"))

	// the shell revalidates, so a deploy reaches the reader on their next request
	expect(response.status).toBe(200)
	expect(response.body).toBe(SHELL_HTML)
	expect(response.cacheControl).toBe("no-cache")
})

// a hashed filename cannot change contents, so it is cached and never revalidated
test("a hashed asset is cached immutably", async () => {
	const bundleDirectory = await makeBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request(HASHED_ASSET_PATH))

	expect(response.status).toBe(200)
	expect(response.cacheControl).toBe("public, max-age=31536000, immutable")
})

// the fallback is for reads. a write to a path nothing handles is a 404, not a page
test("a write to an unknown path is not the app shell", async () => {
	const bundleDirectory = await makeBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123", "POST"))

	expect(response.status).toBe(404)
	expect(response.body).not.toBe(SHELL_HTML)
})

// dev runs the api with no bundle built, since vite serves the ui and proxies /api. that must a 404 and not throw
test("a missing bundle answers 404 instead of failing", async () => {
	const emptyDirectory = await mkdtemp(join(tmpdir(), "carl-no-bundle-"))
	const response = await withWorkingDirectory(emptyDirectory, () => request("/"))

	expect(response.status).toBe(404)
})
