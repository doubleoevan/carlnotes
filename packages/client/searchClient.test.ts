// the site search client: the search's url values on the request, and a failed search throwing
import { afterEach, expect, test } from "bun:test"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import { stubFetch } from "./fetchTestFixtures"
import { searchSite } from "./searchClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

// the search sends its non-default values to the search route and returns the page
test("search sends the search's url values and returns the page", async () => {
	// the search route returns an empty page, with the request url recorded
	let requestedUrl = ""
	const searchPage = { rows: [], rowCount: 0, page: 2, pageCount: 1, pageSize: 10, podcastEpisodes: [] }
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requestedUrl = String(input instanceof Request ? input.url : input)
		return Response.json(searchPage)
	}) as unknown as typeof fetch

	// the query, the kinds, and the page are sent, and the defaults left out
	const searchRequest = searchRequestPayload.parse({ q: "orbit", kinds: ["teams"], page: 2 })
	expect(await searchSite(searchRequest)).toEqual(searchPage)
	expect(requestedUrl).toContain("/api/search?q=orbit&kinds=teams&page=2")
})

// a rejected search throws, so the caller can tell it from an empty one
test("a failed search throws", async () => {
	stubFetch(new Response(null, { status: 429 }))
	expect(searchSite(searchRequestPayload.parse({ q: "orbit" }))).rejects.toThrow("search failed: 429")
})
