// the api's entry started under the web name, as the web service starts it: it serves what the app service serves, and
// its health check says which of the two answered
import { afterAll, afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { DOCS_BUNDLE_ROOT } from "./bundlePaths"
import {
	createBundleDirectory,
	DOCS_NOT_FOUND_HTML,
	PAGE_HTML,
	removeTestDirectories,
	request,
	withWorkingDirectory,
} from "./indexTestFixtures"

// the entry's default export, which Bun serves
type ApiEntry = { default: { fetch: (request: Request) => Response | Promise<Response> } }

// a second copy of the entry, evaluated under the web name. the query string gives it a module of its own, beside the
// copy the other tests import under the api name
const restoreEnvSettings = saveEnvSettings(["PROCESS_NAME"])
let webEntry: ApiEntry
beforeAll(async () => {
	Bun.env.PROCESS_NAME = "web"
	const webEntryPath = "./index?processName=web"
	webEntry = (await import(webEntryPath)) as ApiEntry
})

// put the setting back, and after each test the pool, the Redis client, and the console, and remove the temporary
// directories
afterAll(() => {
	restoreEnvSettings()
})

// each test's stubs and directories
afterEach(async () => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
	await removeTestDirectories()
})

// send a request to the entry started under the web name, and return its status and body
async function requestWeb(path: string): Promise<{ status: number; body: string }> {
	const response = await webEntry.default.fetch(new Request(`http://localhost:3000${path}`))
	return { status: response.status, body: await response.text() }
}

test("each service's health check names the process that answered", async () => {
	expect(JSON.parse((await requestWeb("/api/health")).body)).toEqual({ status: "ok", process: "web" })
	expect(JSON.parse((await request("/api/health")).body)).toEqual({ status: "ok", process: "api" })
})

test("the entry under the web name serves readiness, a page, a Specials page, a document, and the docs", async () => {
	// a bundle whose server renders a page, with the docs site's own 404 page
	const bundleDirectory = await createBundleDirectory()
	await mkdir(join(bundleDirectory, DOCS_BUNDLE_ROOT), { recursive: true })
	await writeFile(join(bundleDirectory, DOCS_BUNDLE_ROOT, "404.html"), DOCS_NOT_FOUND_HTML)
	const [readiness, topicPage, specialsPage, securityDocument, docsPage] = await withWorkingDirectory(
		bundleDirectory,
		() =>
			Promise.all(
				[
					"/api/health/ready",
					"/topics/abc123",
					"/teams/team-1/specials",
					"/.well-known/security.txt",
					"/docs/no-such-page",
				].map(requestWeb),
			),
	)

	// the readiness render and both pages come from the ui's server, the document from the api, and the docs from
	// their own build
	expect(readiness).toEqual({ status: 200, body: JSON.stringify({ status: "ok" }) })
	expect(topicPage).toEqual({ status: 200, body: PAGE_HTML })
	expect(specialsPage).toEqual({ status: 200, body: PAGE_HTML })
	expect(securityDocument?.status).toBe(200)
	expect(docsPage?.status).toBe(404)
	expect(docsPage?.body).toContain(DOCS_NOT_FOUND_HTML)
})

test("the entry under the web name still answers the api and the MCP endpoint", async () => {
	// an empty database and an in-memory Redis, with a quiet console
	stubConnectionPool(() => [])
	stubRedisClient()
	spyOn(console, "warn").mockImplementation(() => {})

	// an unknown api path is the api's own json 404, and the MCP endpoint answers a GET as it does under the api name
	expect(await requestWeb("/api/no-such-route")).toEqual({ status: 404, body: JSON.stringify({ error: "not found" }) })
	const apiNameMcp = await request("/mcp")
	const webNameMcp = await requestWeb("/mcp")
	expect(webNameMcp).toEqual({ status: apiNameMcp.status, body: apiNameMcp.body })
})
