// tests for the rules that decide whether a request is answered by the api, the ui bundle, or a 404
import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CHAT_HISTORY_TURNS } from "@shared/contracts"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import server, { reportUnhandledError } from "./index"

// the two bundle files the serving rules treat differently
const SHELL_HTML = "<!doctype html><title>carl</title>"
const HASHED_ASSET_PATH = "/assets/app-abc123.js"

// serveStatic resolves its root against the working directory, so a test picks its bundle by moving there.
// the directory is restored afterward, since the process is shared with every other test file
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

// a request against the composed app, exactly as the runtime would deliver it. the body is read here, not by
// the caller, since the working directory may already be restored by the time the caller gets to it
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
test("the health route responds without reaching the database", async () => {
	const response = await request("/api/health")
	expect(response.status).toBe(200)
	expect(JSON.parse(response.body)).toEqual({ status: "ok" })
})

// the rule the whole split rests on. a missing endpoint must stay an api failure a fetch client can read,
// never an HTML page that fails at JSON.parse and looks like a working route
test("an unknown api path responds with a json 404, never the app shell", async () => {
	const bundleDirectory = await makeBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/api/does-not-exist"))

	// a JSON body carrying the same error shape every other api route uses
	expect(response.status).toBe(404)
	expect(response.contentType).toContain("application/json")
	expect(JSON.parse(response.body)).toEqual({ error: "not found" })
})

// a throw inside any /api route must still answer the documented json contract, not Hono's default text/plain page
test("an unhandled throw under /api is reported and answered as json", async () => {
	const throwingApp = new Hono().onError(reportUnhandledError).get("/api/boom", () => {
		throw new Error("boom")
	})
	const response = await throwingApp.request("/api/boom")

	expect(response.status).toBe(500)
	expect(response.headers.get("Content-Type")).toContain("application/json")
	expect(await response.json()).toEqual({ error: "internal error" })
})

// the same throw outside /api falls back to Hono's plain-text response, since only the api contract promises json
test("an unhandled throw outside /api falls back to plain text", async () => {
	const throwingApp = new Hono().onError(reportUnhandledError).get("/boom", () => {
		throw new Error("boom")
	})
	const response = await throwingApp.request("/boom")

	expect(response.status).toBe(500)
	expect(await response.text()).toBe("Internal Server Error")
})

// an error that already carries its own response is the caller's fault. zValidator throws one of these on a
// malformed body, so answering it as a server fault would turn every 400 into a reported 500
test("an error carrying its own response keeps that response", async () => {
	const rejectingApp = new Hono().onError(reportUnhandledError).get("/api/bad", () => {
		throw new HTTPException(400, { message: "Malformed JSON in request body" })
	})
	const response = await rejectingApp.request("/api/bad")

	expect(response.status).toBe(400)
	expect(await response.text()).toBe("Malformed JSON in request body")
})

// the throwaway apps above prove the handler, not the wiring. the real server reaches the database, which is
// unreachable here, so a real /api route throws and pins that the composed app actually carries the handler
test("the composed app answers a failed /api route as json", async () => {
	const response = await request("/api/topic-feed")

	expect(response.status).toBe(500)
	expect(response.contentType).toContain("application/json")
})

// a deep link is not a file, so the shell responds, and the client router resolves the path
test("an unknown page path serves the app shell", async () => {
	const bundleDirectory = await makeBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123"))

	// the shell revalidates, so a deploy reaches the user on their next request
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

// the question is validated before the handler runs, so a bad chat turn is rejected without reaching the database or a model
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

// a question longer that the cap is rejected, so that one request cannot inflate the retrieval or the prompt
test("an oversized chat question is rejected", async () => {
	const response = await server.fetch(
		new Request("http://localhost:3000/api/topics/abc123/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ question: "x".repeat(1001) }),
		}),
	)
	expect(response.status).toBe(400)
})

// the chat history is sent by the client, so its depth is capped before it can inflate the token bill
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

// dev runs the api with no bundle built, since vite serves the ui and proxies /api. that must a 404 and not throw
test("a missing bundle responds with a 404 instead of failing", async () => {
	const emptyDirectory = await mkdtemp(join(tmpdir(), "carl-no-bundle-"))
	const response = await withWorkingDirectory(emptyDirectory, () => request("/"))

	expect(response.status).toBe(404)
})
