// where a server render reads the api, and what the web app's api client settings leave unset
import { expect, spyOn, test } from "bun:test"
import { apiClient, configureApiClient, fetchApi } from "@carlnotes/client/apiClient"
import { toServerApiBaseUrl, toWebApiClientSettings } from "./webApiClient"

test("a server render reads its own process unless API_ORIGIN names another origin", () => {
	// unset or empty, the render reads the api of its own process
	expect(toServerApiBaseUrl(undefined)).toBe("http://localhost:3000")
	expect(toServerApiBaseUrl("")).toBe("http://localhost:3000")

	// the origin the setting names, with no slash at its end to double a path's
	expect(toServerApiBaseUrl("http://app:3000")).toBe("http://app:3000")
	expect(toServerApiBaseUrl("http://app:3000/")).toBe("http://app:3000")
})

// the api's rate limiters skip a request with no session and no forwarded address, so a render must add neither
test("the web app's api client settings set no headers and no credentials mode", () => {
	const webApiClientSettings = toWebApiClientSettings("http://app:3000")
	expect(webApiClientSettings.apiBaseUrl).toBe("http://app:3000")
	expect(webApiClientSettings.headers).toBeUndefined()
	expect(webApiClientSettings.credentials).toBeUndefined()
})

// a configured server render's request sends no cookie and no forwarding header
test("a server render's api request sends no cookie and no forwarding header", async () => {
	// configure the server render's client, and keep each request it sends
	const sentRequests: Request[] = []
	const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => {
		sentRequests.push(new Request(input, init))
		return Response.json({})
	}) as typeof fetch)
	configureApiClient(toWebApiClientSettings(toServerApiBaseUrl("http://app:3000")))

	// one read through the plain fetch, and one through the typed client
	try {
		await fetchApi("/api/home")
		await apiClient().api.home.$get({ query: {} })
	} finally {
		fetchSpy.mockRestore()
		configureApiClient({ apiBaseUrl: "", showError: (message) => console.error(message) })
	}

	// neither request names a forwarded address, a session, or a hop
	expect(sentRequests.map((sentRequest) => sentRequest.url)).toEqual([
		"http://app:3000/api/home",
		"http://app:3000/api/home",
	])
	for (const sentRequest of sentRequests) {
		for (const headerName of FORWARDING_HEADER_NAMES) {
			expect(sentRequest.headers.has(headerName)).toBe(false)
		}
	}
})

// the headers that would make a render's request read as a visitor's or a user's
const FORWARDING_HEADER_NAMES = [
	"cookie",
	"authorization",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-proto",
	"x-real-ip",
	"forwarded",
	"cf-connecting-ip",
]
