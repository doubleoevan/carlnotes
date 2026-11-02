// tests for the rules that decide whether a request is served by the api or a 404, the health checks, the 500 for an
// error no route handles, the 404 for a path with a NUL byte, the feed's edge caching, the security.txt noindex header,
// the api's own validation, the mcp routes' body limit, the content security policy, a public file's cache headers, and
// the baseline security headers
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { CHAT_QUESTION_CHARS } from "@carlnotes/contracts/chat"
import { CHAT_HISTORY_TURNS } from "@carlnotes/contracts/chatTurns"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { PROVIDER_PHOTO_ORIGINS } from "./avatars"
import { DEFAULT_BODY_LIMIT_BYTES } from "./bodyLimit"
import { BASELINE_POLICY_DIRECTIVES, FRAME_SOURCE_DIRECTIVE } from "./contentSecurityPolicy"
import { RENDERED_EDGE_CACHE_CONTROL } from "./edgeCache"
import server from "./index"
import {
	createBundleDirectory,
	PAGE_HTML,
	PUBLIC_FILE_TEXT,
	removeTestDirectories,
	request,
	requestWithQueryStub,
	SELECT_ONE_ROWS,
	withWorkingDirectory,
} from "./indexTestFixtures"
import { CONNECT_ACCOUNT_TEXT } from "./mcp/results"
import * as toolCallerModule from "./mcp/toolCaller"
import { toolCallerRateLimitStore } from "./rateLimit"
import { SESSION_COOKIE, signInAs, toJsonRequest } from "./testSession"

// put each spied console method and the Redis client back, and remove the temporary directories after each test,
// whether its assertions pass or not
afterEach(async () => {
	mock.restore()
	restoreRedisClient()
	await removeTestDirectories()
})

// the platform polls the health route to decide whether to cycle the container,
// so the route responds from the process alone
test("the health route responds without reaching the database", async () => {
	const response = await requestWithQueryStub({
		path: "/api/health",
		toQueryRows: () => SELECT_ONE_ROWS,
	})
	expect(response.status).toBe(200)
	expect(JSON.parse(response.body)).toEqual({ status: "ok" })
	expect(response.queryCount).toBe(0)
})

// a monitor polls the deep health check to learn that the database responds and never reads a cached result
test("the deep health check runs one query and responds with the pool's counts", async () => {
	const response = await requestWithQueryStub({
		path: "/api/health/deep",
		toQueryRows: () => SELECT_ONE_ROWS,
	})
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
	const response = await requestWithQueryStub({
		path: "/api/health/deep",
		toQueryRows: () => {
			throw new Error("connection refused")
		},
	})

	// the failure is logged, and the response says the database is unavailable
	expect(response.status).toBe(503)
	expect(response.cacheControl).toBe("no-store")
	expect(JSON.parse(response.body)).toMatchObject({ status: "unavailable" })
	expect(consoleErrorSpy).toHaveBeenCalled()
})

// a route whose query fails, as one does after waiting past the pool's timeout, responds 500 and reports the error
test("an error no route handles responds 500 and is reported", async () => {
	// an empty Redis, so the feed's cache misses and the failing query runs, whatever a local Redis holds
	stubRedisClient()
	const reportErrorSpy = quietErrorReports()
	const poolTimeout = new Error("timeout exceeded when trying to connect")
	const response = await requestWithQueryStub({
		path: "/api/topic-feed",
		toQueryRows: () => {
			throw poolTimeout
		},
	})

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

// the signed-out feed is the same for every visitor, so the edge shares it and compresses it on the way out
test("the signed-out feed is shared at the edge and sent uncompressed, and a signed-in feed is private", async () => {
	const acceptEncodingHeader = { "accept-encoding": "gzip, br" }
	const signedOutResponse = await requestWithQueryStub({
		path: "/api/topic-feed",
		toQueryRows: () => [],
		requestInit: { headers: acceptEncodingHeader },
	})
	const signedInResponse = await requestWithQueryStub({
		path: "/api/topic-feed",
		toQueryRows: () => [],
		requestInit: { headers: { ...acceptEncodingHeader, cookie: SESSION_COOKIE } },
	})

	// only the signed-out feed is shared at the edge, and the api compresses neither
	expect(signedOutResponse.status).toBe(200)
	expect(signedOutResponse.edgeCacheControl).toBe(RENDERED_EDGE_CACHE_CONTROL)
	expect(signedOutResponse.contentEncoding).toBeNull()
	expect(signedInResponse.cacheControl).toBe("private, no-cache")
	expect(signedInResponse.edgeCacheControl).toBeNull()
})

// a NUL byte in a path id never reaches Postgres, which rejects the byte in a text value
test("a path with a NUL byte responds with a json 404 and sends no query", async () => {
	const nulByteRequests = [
		{ method: "POST", path: "/api/topics/%00/view" },
		{ method: "GET", path: "/api/counts/topics/top%00ic" },
		{ method: "GET", path: "/topics/%00" },
	]
	for (const { method, path } of nulByteRequests) {
		const response = await requestWithQueryStub({ path, toQueryRows: () => [], requestInit: { method } })
		expect(response.status).toBe(404)
		expect(JSON.parse(response.body)).toEqual({ error: "not found" })
		expect(response.queryCount).toBe(0)
	}
})

// security.txt is for a researcher, so a search engine leaves it out of its results
test("security.txt is served with a noindex header", async () => {
	const response = await request("/.well-known/security.txt")

	expect(response.status).toBe(200)
	expect(response.robotsTag).toBe("noindex")
})

// the fallback is for reads. a write to a path nothing handles is a 404, not a page
test("a write to an unknown path responds 404, never a page", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/topics/abc123", { method: "POST" }))

	expect(response.status).toBe(404)
	expect(response.body).not.toBe(PAGE_HTML)
})

// post a chat turn as a signed-in user. a signed-out post is rejected before its body is read, so the payload checks
// are reached only with a session
async function postSignedInChatTurn(chatTurnBody: unknown): Promise<Response> {
	signInAs("user-1")
	return server.fetch(new Request("http://localhost:3000/api/topics/abc123/chat", toJsonRequest(chatTurnBody)))
}

// the question is validated before the handler runs
test("a chat turn with no question is rejected before any work", async () => {
	const response = await postSignedInChatTurn({ question: "   " })
	expect(response.status).toBe(400)
})

// a question longer that the limit is rejected, so that one request cannot inflate the retrieval or the prompt
test("an oversized chat question is rejected", async () => {
	const response = await postSignedInChatTurn({ question: "x".repeat(CHAT_QUESTION_CHARS + 1) })
	expect(response.status).toBe(400)
})

// the chat history is sent by the api client, so its depth is limited before it can inflate the token bill
test("an oversized chat history is rejected", async () => {
	const history = Array.from({ length: CHAT_HISTORY_TURNS + 1 }, () => ({ question: "q", answer: "a" }))
	const response = await postSignedInChatTurn({ question: "what is new?", history })
	expect(response.status).toBe(400)
})

// the mcp routes sit outside the api tree, so they apply the default body limit themselves before a tool call is read
test("an mcp request past the default body limit is rejected with a 413", async () => {
	stubRedisClient()
	const response = await server.fetch(
		new Request("http://localhost:3000/mcp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "x".repeat(DEFAULT_BODY_LIMIT_BYTES + 1),
		}),
	)
	expect(response.status).toBe(413)
	expect(await response.json()).toEqual({ error: "request body too large" })
})

// both transport routes reject a foreign origin before credentials, quotas, or request bodies are processed
test("mcp origin rejection precedes caller lookup and rate limiting for every method", async () => {
	// fail if either account work or quota consumption is reached
	const resolveCallerSpy = spyOn(toolCallerModule, "resolveToolCaller").mockRejectedValue(new Error("caller reached"))
	const incrementSpy = spyOn(toolCallerRateLimitStore, "increment").mockImplementation(() => {
		throw new Error("quota reached")
	})
	for (const path of ["/mcp", "/mcp/t/topic-1"]) {
		for (const method of ["POST", "GET", "HEAD", "OPTIONS", "DELETE"]) {
			const response = await server.fetch(
				new Request(`http://localhost:3000${path}`, {
					method,
					headers: { origin: "https://attacker.example", authorization: "Bearer test-token" },
				}),
			)
			expect(response.status).toBe(403)
		}
	}

	// an origin denial performs neither kind of account work
	expect(resolveCallerSpy).not.toHaveBeenCalled()
	expect(incrementSpy).not.toHaveBeenCalled()
})

// allowed and absent origins preserve the transport's anonymous initialization
test("mcp accepts no Origin or the hosted Origin on both transport routes", async () => {
	stubRedisClient()
	for (const path of ["/mcp", "/mcp/t/topic-1"]) {
		for (const origin of [null, "https://carlnotes.com"]) {
			// a valid initialize reaches the stateless transport
			const headers = new Headers({ "content-type": "application/json", accept: "application/json, text/event-stream" })
			if (origin !== null) {
				headers.set("origin", origin)
			}
			const response = await server.fetch(
				new Request(`http://localhost:3000${path}`, {
					method: "POST",
					headers,
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-06-18",
							capabilities: {},
							clientInfo: { name: "origin-test", version: "1" },
						},
					}),
				}),
			)
			expect(response.status).toBe(200)
		}
	}
})

// an allowed browser origin grants no account permissions
test("an allowed Origin still requires an account for writes on either endpoint", async () => {
	stubRedisClient()
	for (const path of ["/mcp", "/mcp/t/topic-1"]) {
		const response = await server.fetch(
			new Request(`http://localhost:3000${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					origin: "https://carlnotes.com",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: { name: "create_topic", arguments: { name: "visitor", prompt: "visitor" } },
				}),
			}),
		)
		const body = (await response.json()) as { result: { content: { text: string }[] } }
		expect(response.status).toBe(200)
		expect(body.result.content[0]?.text).toBe(CONNECT_ACCOUNT_TEXT)
	}
})

// discovery and the consent page are not mcp transport endpoints
test("mcp origin protection leaves discovery and consent reachable", async () => {
	// serve the consent page through the test bundle under the existing render path
	stubRedisClient()
	const bundleDirectory = await createBundleDirectory()
	const consentResponse = await withWorkingDirectory(bundleDirectory, () =>
		request("/mcp/consent", { headers: { origin: "https://attacker.example" } }),
	)
	expect(consentResponse.status).toBe(200)
	expect(consentResponse.body).toBe(PAGE_HTML)

	// the client can still discover both the issuer and the topic-bound resource
	for (const path of [
		"/.well-known/oauth-authorization-server",
		"/.well-known/oauth-protected-resource/mcp/t/topic-1",
	]) {
		const response = await request(path, { headers: { origin: "https://attacker.example" } })
		expect(response.status).toBe(200)
		expect(response.contentType).toContain("application/json")
	}
})

// an oauth avatar redirects to its provider, so the policy has to allow that origin
test("the content security policy allows every provider photo host the avatar redirect points at", async () => {
	const response = await request("/api/health")
	const imageSources = response.contentSecurityPolicy?.split(";")[0] ?? ""
	for (const photoOrigin of PROVIDER_PHOTO_ORIGINS) {
		expect(imageSources).toContain(photoOrigin)
	}
})

// signup renders the Turnstile challenge in an iframe from Cloudflare, so the policy has to allow that origin. its
// frame-src is the directive that the component browser's policy shares
test("the content security policy allows the shared frame sources, the Turnstile challenge among them", async () => {
	const response = await request("/api/health")
	const policyDirectives = response.contentSecurityPolicy?.split(";") ?? []
	const frameSources = policyDirectives.find((directive) => directive.trim().startsWith("frame-src")) ?? ""
	expect(frameSources.trim()).toBe(FRAME_SOURCE_DIRECTIVE)
	expect(frameSources).toContain("https://challenges.cloudflare.com")
})

// an unhashed public file changes only with a release, so the browser keeps it an hour and the edge a day under the
// tag the release purge clears
test("a public file is cached for an hour in the browser and a day at the edge", async () => {
	const bundleDirectory = await createBundleDirectory()
	const response = await withWorkingDirectory(bundleDirectory, () => request("/robots.txt"))

	expect(response.status).toBe(200)
	expect(response.body).toBe(PUBLIC_FILE_TEXT)
	expect(response.cacheControl).toBe("public, max-age=3600")
	expect(response.edgeCacheControl).toBe("max-age=86400")
})

// every response names the referrer a cross-origin link sees, forbids type sniffing, and includes every baseline
// policy directive
test("every response includes the baseline security headers", async () => {
	const response = await server.fetch(new Request("http://localhost:3000/api/health"))

	// the referrer and sniffing headers, which the request fixture does not read
	expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
	expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")

	// every directive that each policy includes
	const contentSecurityPolicy = response.headers.get("Content-Security-Policy") ?? ""
	for (const policyDirective of BASELINE_POLICY_DIRECTIVES) {
		expect(contentSecurityPolicy).toContain(policyDirective)
	}
})
