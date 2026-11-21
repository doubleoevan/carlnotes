// page read request tests: each page's server load sends the requests that packages/contracts lists for it, one page
// read, and a load in the browser, which hydration runs, sends none
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { type PageReadKind, toPageReadRequestPaths } from "@carlnotes/contracts/pageReadRequests"
import { loadRouter } from "./-loadRouter"

// the ids the pages' urls name
const PAGE_PARAMS = {
	userId: "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c",
	id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
	season: "2026",
	episodeNumber: "28",
	topicPostId: "5d4e3f2a-1b0c-4d8e-9f7a-8b6c3f2a1b0c",
}

// each page's url, by the page read it loads
const PAGE_PATHS: Record<PageReadKind, string> = {
	profile: `/profiles/${PAGE_PARAMS.userId}`,
	team: `/teams/${PAGE_PARAMS.id}`,
	home: "/",
	topic: `/topics/${PAGE_PARAMS.id}/agents`,
	podcastEpisode: `/topics/${PAGE_PARAMS.id}/agents/episodes/2026/28`,
	topicPost: `/topics/${PAGE_PARAMS.id}/agents/posts/${PAGE_PARAMS.topicPostId}`,
	dashboard: `/profiles/${PAGE_PARAMS.userId}/specials/topics`,
}

// each page's request params, which name the page read's own ids
const REQUEST_PARAMS: Record<PageReadKind, Record<string, string>> = {
	profile: { userId: PAGE_PARAMS.userId },
	team: { id: PAGE_PARAMS.id },
	home: {},
	topic: { id: PAGE_PARAMS.id },
	podcastEpisode: { id: PAGE_PARAMS.id, season: PAGE_PARAMS.season, episodeNumber: PAGE_PARAMS.episodeNumber },
	topicPost: { id: PAGE_PARAMS.topicPostId },
	dashboard: { dashboardKind: "topicDashboard", subjectId: PAGE_PARAMS.userId },
}

// the paths the fake fetch was asked for, oldest first
const requestedPaths: string[] = []

// a fake fetch that records each path and responds 404, so each load stops after its own reads
const realFetch = globalThis.fetch
beforeAll(() => {
	globalThis.fetch = ((input: RequestInfo | URL) => {
		requestedPaths.push(new URL(input instanceof Request ? input.url : input.toString()).pathname)
		return Promise.resolve(Response.json({ error: "not found" }, { status: 404 }))
	}) as typeof fetch
})

// the real fetch back after the tests
afterAll(() => {
	globalThis.fetch = realFetch
})

// no window and no recorded path after each test
afterEach(() => {
	requestedPaths.length = 0
	Reflect.deleteProperty(globalThis, "window")
})

test("each page's server load sends its one page read", async () => {
	for (const [pageReadKind, pagePath] of Object.entries(PAGE_PATHS) as [PageReadKind, string][]) {
		requestedPaths.length = 0
		await loadRouter(pagePath)
		expect({ pageReadKind, requestedPaths }).toEqual({
			pageReadKind,
			requestedPaths: toPageReadRequestPaths(pageReadKind, REQUEST_PARAMS[pageReadKind]),
		})
	}
})

test("each page's load in the browser, which hydration runs, sends no request", async () => {
	// a window, which tells each loader it runs in the browser
	Object.assign(globalThis, { window: globalThis })
	for (const pagePath of Object.values(PAGE_PATHS)) {
		await loadRouter(pagePath)
	}
	expect(requestedPaths).toEqual([])
})
