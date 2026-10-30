// api client tests: the configured headers and credentials on a typed call and a plain fetch, the 401 report, and a
// client configured with none of them
import { afterEach, expect, test } from "bun:test"
import { toTolerantResponseSchema } from "@carlnotes/contracts/tolerantReads"
import { z } from "zod"
import { type ApiResponse, apiClient, configureApiClient, fetchApi, readApiResponse } from "./apiClient"

// what the stubbed fetch records of each request: its url and the init the client built
type RecordedRequest = { url: string; init: RequestInit }

// the fetch every test stubs, put back after each one, and the client put back to the page's own origin
const realFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = realFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

// stub every fetch to record its request and answer with the status
function stubRecordingFetch(status: number): RecordedRequest[] {
	const recordedRequests: RecordedRequest[] = []

	// keep each request as the client built it, and answer with the status
	globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
		recordedRequests.push({ url: String(input), init })
		return new Response("{}", { status, headers: { "content-type": "application/json" } })
	}) as unknown as typeof fetch
	return recordedRequests
}

// the cookie header a recorded request sends, or null
function toCookieHeader(recordedRequest: RecordedRequest): string | null {
	return new Headers(recordedRequest.init.headers).get("cookie")
}

// a configured app sends its headers and credentials on a typed call and on a plain fetch alike
test("a typed call and a plain fetch send the configured headers and credentials", async () => {
	const recordedRequests = stubRecordingFetch(200)
	configureApiClient({
		apiBaseUrl: "https://api.example",
		showError: () => {},
		headers: async () => ({ cookie: "better-auth.session_token=abc" }),
		credentials: "omit",
	})

	// one typed call and one plain fetch with a header of its own
	await apiClient().api.search.$get({ query: { q: "coffee" } })
	await fetchApi("/api/users/me", { method: "DELETE", headers: { "x-own": "1" } })

	// both reach the base url with the cookie and the credentials
	expect(recordedRequests.map((recordedRequest) => new URL(recordedRequest.url).origin)).toEqual([
		"https://api.example",
		"https://api.example",
	])
	for (const recordedRequest of recordedRequests) {
		expect(toCookieHeader(recordedRequest)).toBe("better-auth.session_token=abc")
		expect(recordedRequest.init.credentials).toBe("omit")
	}

	// the plain fetch keeps its own header and method
	expect(new Headers(recordedRequests[1]?.init.headers).get("x-own")).toBe("1")
	expect(recordedRequests[1]?.init.method).toBe("DELETE")
})

// the headers function reads the credentials the call asked for, on a typed call and on a plain fetch alike
test("the headers function reads the call's credentials mode", async () => {
	const recordedRequests = stubRecordingFetch(200)
	configureApiClient({
		apiBaseUrl: "https://api.example",
		showError: () => {},
		headers: ({ credentials } = {}): Record<string, string> =>
			credentials === "omit" ? {} : { cookie: "better-auth.session_token=abc" },
		credentials: "omit",
	})

	// a public read asks for no credentials, and a default call asks for none in particular
	await apiClient().api.counts.topics[":id"].$get({ param: { id: "topic-1" } }, { init: { credentials: "omit" } })
	await fetchApi("/api/counts/topics/topic-2", { credentials: "omit" })
	await apiClient().api.search.$get({ query: { q: "coffee" } })
	await fetchApi("/api/users/me")

	// the public reads send no cookie, the others do, and every request keeps the configured credentials
	expect(recordedRequests.map(toCookieHeader)).toEqual([
		null,
		null,
		"better-auth.session_token=abc",
		"better-auth.session_token=abc",
	])
	expect(recordedRequests.map((recordedRequest) => recordedRequest.init.credentials)).toEqual([
		"omit",
		"omit",
		"omit",
		"omit",
	])
})

// a 401 reaches the app once per response, from a typed call and from a plain fetch
test("a 401 calls onUnauthorized once per response", async () => {
	stubRecordingFetch(401)
	let unauthorizedCount = 0
	configureApiClient({ apiBaseUrl: "", showError: () => {}, onUnauthorized: () => unauthorizedCount++ })
	await apiClient().api.search.$get({ query: { q: "coffee" } })
	await fetchApi("/api/users/me")
	expect(unauthorizedCount).toBe(2)
})

// the web configures none of the three, and its requests have no header the client added
test("a client configured with no headers adds none", async () => {
	const recordedRequests = stubRecordingFetch(200)
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
	await apiClient().api.search.$get({ query: { q: "coffee" } })
	await fetchApi("/api/users/me")

	// no cookie and no credentials mode, so the browser sends its own
	for (const recordedRequest of recordedRequests) {
		expect(toCookieHeader(recordedRequest)).toBeNull()
		expect(recordedRequest.init.credentials).toBeUndefined()
	}
})

test("an account-retired request never dispatches after delayed session headers", async () => {
	// hold session headers until the originating account has retired
	const requests = stubRecordingFetch(200)
	const headers = Promise.withResolvers<Record<string, string>>()
	const controller = new AbortController()
	configureApiClient({ apiBaseUrl: "https://api.example", showError: () => {}, headers: () => headers.promise })
	const pendingRequest = fetchApi("/api/episodes/episode-1/listen", { method: "POST", signal: controller.signal })
	// cancel before headers resolve and verify that no request leaves the client
	controller.abort()
	headers.resolve({ Cookie: "retired-session" })
	await expect(pendingRequest).rejects.toThrow()
	expect(requests).toHaveLength(0)
})

// a write rejected for the Terms waits for the dialog. accepted, the same request is sent again and its response
// returned. dismissed, the rejection is returned as it came
test("a terms rejection is sent again after acceptance and returned as is after a dismissal", async () => {
	const termsRejection = JSON.stringify({ rejection: "termsOutdated", termsVersion: "2026-10-29" })
	const recordedRequests: RecordedRequest[] = []
	let dialogOutcome: "accepted" | "dismissed" = "accepted"
	globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
		recordedRequests.push({ url: String(input), init })
		const isFirstTry = recordedRequests.length % 2 === 1
		return new Response(isFirstTry ? termsRejection : "{}", {
			status: isFirstTry ? 403 : 200,
			headers: { "content-type": "application/json" },
		})
	}) as unknown as typeof fetch
	configureApiClient({
		apiBaseUrl: "https://api.example",
		showError: () => {},
		onTermsOutdated: async () => dialogOutcome,
	})

	// accepted: the second response comes back, from the same body
	const acceptedResponse = await fetchApi("/api/notes", { method: "POST", body: '{"name":"kept"}' })
	expect(acceptedResponse.status).toBe(200)
	expect(recordedRequests).toHaveLength(2)
	expect(recordedRequests[1]?.init.body).toBe('{"name":"kept"}')

	// dismissed: the rejection stands, with its body still readable
	dialogOutcome = "dismissed"
	const dismissedResponse = await fetchApi("/api/notes", { method: "POST", body: "{}" })
	expect(dismissedResponse.status).toBe(403)
	expect(await dismissedResponse.json()).toMatchObject({ rejection: "termsOutdated" })
	expect(recordedRequests).toHaveLength(3)
})

// the body an outdated build gets, and a fetch that answers every request with it
const OUTDATED_BODY = { rejection: "appVersionOutdated", minimumVersion: "1.2.0", storeUrl: "https://example/store" }
function stubOutdatedFetch(body: string): void {
	globalThis.fetch = (async () =>
		new Response(body, { status: 426, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
}

// a 426 on a typed call and on a plain fetch each reach the app once, with the body, and the response still returns
test("a typed call and a plain fetch report a 426 with its body and return the response", async () => {
	stubOutdatedFetch(JSON.stringify(OUTDATED_BODY))
	const reportedRejections: unknown[] = []
	configureApiClient({
		apiBaseUrl: "https://api.example",
		showError: () => {},
		onAppVersionOutdated: (rejection) => reportedRejections.push(rejection),
	})

	// both transports return the 426 and its body to the caller
	const typedResponse = await apiClient().api.search.$get({ query: { q: "coffee" } })
	const plainResponse = await fetchApi("/api/topic-feed")
	expect(typedResponse.status).toBe(426)
	expect(plainResponse.status).toBe(426)
	expect(await plainResponse.json()).toEqual(OUTDATED_BODY)
	expect(reportedRejections).toEqual([OUTDATED_BODY, OUTDATED_BODY])
})

// a 426 with no readable body still reports, with null
test("a 426 without a body reports null", async () => {
	stubOutdatedFetch("")
	const reportedRejections: unknown[] = []
	configureApiClient({
		apiBaseUrl: "https://api.example",
		showError: () => {},
		onAppVersionOutdated: (rejection) => reportedRejections.push(rejection),
	})
	await fetchApi("/api/topic-feed")
	expect(reportedRejections).toEqual([null])
})

// a response read through readApiResponse parses with the configured schema: strict by default, tolerant for the app
test("readApiResponse parses the contract by default and the configured schema when one is set", async () => {
	const schema = z.object({ rows: z.array(z.object({ id: z.string() })) })
	const body = { rows: [{ id: "a" }, { id: 2 }] }
	const response = (url: string): ApiResponse & { url: string } => ({
		ok: true,
		status: 200,
		url,
		json: async () => body,
		text: async () => JSON.stringify(body),
	})

	// the strict default throws an error naming the route and the path, never the body
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
	await expect(
		readApiResponse(schema, response("http://x/api/topics/8f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f")),
	).rejects.toThrow("/api/topics/:id did not match its contract: rows.1.id")

	// the tolerant schema drops the entry and reports the route and the count
	const issues: unknown[] = []
	configureApiClient({
		apiBaseUrl: "",
		showError: () => {},
		toResponseSchema: toTolerantResponseSchema,
		onTolerantReadIssue: (issue) => issues.push(issue),
	})
	const parsed = await readApiResponse(schema, response("http://x/api/rooms/42/messages"))
	expect(parsed).toEqual({ rows: [{ id: "a" }] })
	expect(issues).toEqual([{ route: "/api/rooms/:id/messages", droppedEntryCount: 1 }])
})

// a failed tolerant parse takes its own dropped count with it instead of reporting it against the next route
test("readApiResponse resets the dropped count on a failed tolerant parse", async () => {
	const issues: unknown[] = []
	configureApiClient({
		apiBaseUrl: "",
		showError: () => {},
		toResponseSchema: toTolerantResponseSchema,
		onTolerantReadIssue: (issue) => issues.push(issue),
	})
	const schema = z.object({ rows: z.array(z.object({ id: z.string() })), name: z.string() })
	const response = (url: string, body: unknown): ApiResponse & { url: string } => ({
		ok: true,
		status: 200,
		url,
		json: async () => body,
		text: async () => JSON.stringify(body),
	})

	// the failed parse drops a row before its name fails, and the next route reads clean
	await expect(readApiResponse(schema, response("/api/rooms/1", { rows: [{ id: 2 }], name: 3 }))).rejects.toThrow(
		"did not match its contract",
	)
	await readApiResponse(schema, response("/api/rooms/2", { rows: [{ id: "a" }], name: "b" }))
	expect(issues).toEqual([])
})
