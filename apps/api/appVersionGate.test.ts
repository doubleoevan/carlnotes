// the gate rejects an older native build alone: an equal or newer build, the web, a request without a version, and a
// platform with no minimum all pass
import { afterEach, beforeEach, expect, test } from "bun:test"
import { PLAY_STORE_URL } from "@carlnotes/contracts/mobileApp"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { Hono } from "hono"
import { appVersionGate } from "./appVersionGate"

// a route behind the gate, over an ios minimum of 1.2.0 and no android minimum
const app = new Hono().use(appVersionGate).get("/api/thing", (context) => context.json({ ok: true }))

// each test reads the one stored ios minimum through an empty in-memory Redis
beforeEach(() => {
	stubRedisClient()
	stubConnectionPool(() => [["ios", "1.2.0"]])
})

// put both stores back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

// a request with the given platform and version headers
function requestAs(headers: Record<string, string>): Promise<Response> {
	return Promise.resolve(app.request("/api/thing", { headers }))
}

test("an older build is rejected with 426, the minimum and the store url, uncached", async () => {
	const response = await requestAs({ "x-carlnotes-platform": "ios", "x-carlnotes-app-version": "1.1.9" })
	expect(response.status).toBe(426)
	expect(response.headers.get("cache-control")).toBe("no-store")

	// the body names the rejection, the minimum, and the store
	const body = await response.json()
	expect(body.rejection).toBe("appVersionOutdated")
	expect(body.minimumVersion).toBe("1.2.0")
	expect(body.storeUrl).toMatch(/^https?:\/\//)
})

test("an equal and a newer build pass", async () => {
	expect((await requestAs({ "x-carlnotes-platform": "ios", "x-carlnotes-app-version": "1.2.0" })).status).toBe(200)
	expect((await requestAs({ "x-carlnotes-platform": "ios", "x-carlnotes-app-version": "1.10.0" })).status).toBe(200)
})

test("a web request and a request without a version pass", async () => {
	expect((await requestAs({})).status).toBe(200)
	expect((await requestAs({ "x-carlnotes-platform": "ios" })).status).toBe(200)
	expect((await requestAs({ "x-carlnotes-platform": "web", "x-carlnotes-app-version": "0.0.1" })).status).toBe(200)
})

test("a platform with no minimum passes any build", async () => {
	expect((await requestAs({ "x-carlnotes-platform": "android", "x-carlnotes-app-version": "0.0.1" })).status).toBe(200)
})

test("an outdated android build is sent to the Play listing", async () => {
	restoreConnectionPool()
	stubConnectionPool(() => [["android", "3.0.0"]])
	const response = await requestAs({ "x-carlnotes-platform": "android", "x-carlnotes-app-version": "2.9.0" })
	expect(response.status).toBe(426)
	expect((await response.json()).storeUrl).toBe(PLAY_STORE_URL)
})

test("a health check mounted ahead of the gate passes an older build", async () => {
	// the api mounts both health routes before the gate
	const appWithHealth = new Hono()
		.get("/api/health", (context) => context.json({ ok: true }))
		.use("/api/*", appVersionGate)
		.get("/api/thing", (context) => context.json({ ok: true }))
	const headers = { "x-carlnotes-platform": "ios", "x-carlnotes-app-version": "1.1.9" }
	expect((await appWithHealth.request("/api/health", { headers })).status).toBe(200)
	expect((await appWithHealth.request("/api/thing", { headers })).status).toBe(426)
})
