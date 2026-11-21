// page read request tests: a page's server load requests fill in their params, and every page sends one request
import { expect, test } from "bun:test"
import { PAGE_READ_REQUESTS, toPageReadRequestPaths } from "./pageReadRequests"

test("a page's requests fill in their params, and a param left out stays its pattern", () => {
	expect(toPageReadRequestPaths("podcastEpisode", { id: "topic-1", season: "2026", episodeNumber: "28" })).toEqual([
		"/api/topics/topic-1/episodes/2026/28/page",
	])
	expect(toPageReadRequestPaths("team")).toEqual(["/api/teams/:id/page"])
})

test("every page's server load sends one request", () => {
	for (const requestPaths of Object.values(PAGE_READ_REQUESTS)) {
		expect(requestPaths).toHaveLength(1)
	}
})
