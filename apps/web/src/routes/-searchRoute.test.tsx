// the search page as the server renders it for a visitor, and its search in the url: a shared url, a rejected value,
// and the back button
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test"
import type { SearchResultsPage } from "@carlnotes/contracts/search"
import { type AnyRouter, RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"
import { loadRouter } from "./-loadRouter"

// a page of one public team the search found
const SEARCH_PAGE: SearchResultsPage = {
	rows: [
		{
			kind: "team",
			id: "team-1",
			name: "Orbit Club",
			path: "/teams/team-1",
			date: null,
			count: null,
			team: { teamId: "team-1", name: "Orbit Club", avatarVersion: null },
			topicCount: 2,
			memberCount: 5,
		},
	],
	rowCount: 1,
	page: 1,
	pageCount: 1,
	pageSize: 10,
	podcastEpisodes: [],
}

// the search page's url values as its route validated them
function toSearchMatchValues(router: AnyRouter): unknown {
	return router.state.matches.find((routeMatch) => routeMatch.routeId === "/_layout/search")?.search
}

// the search urls the api was asked for
let requestedSearchUrls: URL[] = []

// the real fetch, restored after the tests
const realFetch = globalThis.fetch

// a fake fetch that returns the search page for a search and 404 for anything else
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const requestUrl = new URL(input instanceof Request ? input.url : input.toString())
	if (requestUrl.pathname !== "/api/search") {
		return Promise.resolve(Response.json({ error: "not found" }, { status: 404 }))
	}
	requestedSearchUrls.push(requestUrl)
	return Promise.resolve(Response.json(SEARCH_PAGE))
}

// swap the fake fetch in for these tests, and restore the real fetch after
beforeAll(() => {
	globalThis.fetch = fakeFetch as typeof fetch
})
afterAll(() => {
	globalThis.fetch = realFetch
})
beforeEach(() => {
	requestedSearchUrls = []
})

// a visitor's search renders its results on the server, with the search page's title and noindex
test("a visitor's search renders its results on the server and is never indexed", async () => {
	const { router, serverLoadResult } = await loadRouter("/search?q=orbit")
	const html = renderToString(<RouterProvider router={router} />)

	expect(serverLoadResult).toMatchObject({ type: "render", status: 200 })
	expect(html).toContain("<title>Search — CarlNotes</title>")
	expect(html).toContain('<meta name="robots" content="noindex, follow"')
	expect(html).toContain("Orbit Club")
	expect(html).toContain('value="orbit"')
})

// a shared url reads the same search, and the api is asked for exactly it
test("a shared url opens the same search", async () => {
	const { router } = await loadRouter("/search?q=orbit&kinds=topics,podcastEpisodes&sort=newest&page=2")
	expect(toSearchMatchValues(router)).toEqual({ q: "orbit", kinds: "topics,podcastEpisodes", sort: "newest", page: 2 })
	expect(Object.fromEntries(requestedSearchUrls[0]?.searchParams ?? [])).toEqual({
		q: "orbit",
		kinds: "topics,podcastEpisodes",
		sort: "newest",
		page: "2",
	})
})

// the Filters menu's values and the tags in a shared url read the same search too
test("a shared url keeps its filters and tags", async () => {
	const { router } = await loadRouter(
		"/search?q=orbit&resourceKinds=read,listen&view=unread&tags=ai,space&tagMatch=all",
	)
	const filteredSearch = { q: "orbit", resourceKinds: "read,listen", view: "unread", tags: "ai,space", tagMatch: "all" }
	expect(toSearchMatchValues(router)).toEqual(filteredSearch)
	expect(Object.fromEntries(requestedSearchUrls[0]?.searchParams ?? [])).toEqual(filteredSearch)
})

// a value the contract rejects reads as its default, so the server redirects to the url that keeps the rest
test("a rejected url value falls back to its default", async () => {
	const { serverLoadResult } = await loadRouter("/search?q=orbit&sort=loudest&page=0&kinds=planets")
	expect(serverLoadResult).toMatchObject({ type: "redirect", redirect: { options: { href: "/search?q=orbit" } } })
})

// each change is a new history entry, so back returns to the search before it
test("back returns to the last search", async () => {
	const { router } = await loadRouter("/search?q=orbit")
	router.history.push("/search?q=orbit&kinds=topics,podcastEpisodes,findings,users")
	await router.load()
	expect(toSearchMatchValues(router)).toEqual({ q: "orbit", kinds: "topics,podcastEpisodes,findings,users" })

	// back is the search with every kind on again
	router.history.back()
	await router.load()
	expect(toSearchMatchValues(router)).toEqual({ q: "orbit" })
})
