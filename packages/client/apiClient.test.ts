// api client tests: the configured headers and credentials on a typed call and a plain fetch, the 401 report, and a
// client configured with none of them
import { afterEach, expect, test } from "bun:test"
import { apiClient, configureApiClient, fetchApi } from "./apiClient"

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
