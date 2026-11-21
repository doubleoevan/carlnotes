// edge cache check tests: the shared paths found from a sitemap, and which responses count as never stored
import { expect, test } from "bun:test"
import {
	FIXED_SHARED_PATHS,
	toEdgeCacheFailure,
	toOwnerSharedPaths,
	toSharedPaths,
	toSitemapPages,
} from "./edgeCacheCheck"

// a sitemap that lists a static page, a Topic, its podcast episode and its Topic Post, and a team
const SITEMAP_XML = [
	'<?xml version="1.0" encoding="UTF-8"?><urlset>',
	"<url><loc>https://carlnotes.com/plans</loc></url>",
	"<url><loc>https://carlnotes.com/topics/topic-1/coffee</loc></url>",
	"<url><loc>https://carlnotes.com/topics/topic-1/coffee/episodes/2026/3</loc></url>",
	"<url><loc>https://carlnotes.com/topics/topic-1/coffee/posts/post-1/light-roasts</loc></url>",
	"<url><loc>https://carlnotes.com/teams/team-1</loc></url>",
	"</urlset>",
].join("")

// each listed page adds its page and its page read, a Topic its feed and its Scan status, and a team its Dashboard
test("the shared paths are the fixed ones and each listed page's page and page read", () => {
	expect(toSharedPaths(toSitemapPages(SITEMAP_XML))).toEqual([
		...FIXED_SHARED_PATHS,
		"/topics/topic-1/coffee",
		"/api/topics/topic-1/page",
		"/topics/topic-1/feed.xml",
		"/topics/topic-1/coffee/episodes/2026/3",
		"/api/topics/topic-1/episodes/2026/3/page",
		"/topics/topic-1/coffee/posts/post-1/light-roasts",
		"/api/topic-posts/post-1/page",
		"/teams/team-1",
		"/api/teams/team-1/page",
		"/api/dashboards/teamDashboard/team-1/page",
		"/api/status/topics/topic-1/scan",
	])
})

// the sitemap lists no profile, so the first Topic's owner gives the profile and Dashboard page reads
test("a Topic's owner adds their profile's and their Dashboard's page reads", () => {
	expect(toOwnerSharedPaths("owner-1")).toEqual([
		"/api/profiles/owner-1/page",
		"/api/dashboards/topicDashboard/owner-1/page",
	])
})

// an empty site still checks the fixed paths
test("a sitemap with no public page checks the fixed paths alone", () => {
	expect(toSharedPaths(toSitemapPages("<urlset></urlset>"))).toEqual(FIXED_SHARED_PATHS)
})

// DYNAMIC and BYPASS fail, a stored or soon stored response passes, and an error or a missing header fails
test("only a response the edge never stores fails", () => {
	expect(toEdgeCacheFailure({ status: 200, cacheStatus: "DYNAMIC" })).toBe("DYNAMIC")
	expect(toEdgeCacheFailure({ status: 200, cacheStatus: "BYPASS" })).toBe("BYPASS")

	// every other status passes, because the edge stored the response or may on a later request
	for (const cacheStatus of ["HIT", "MISS", "EXPIRED", "REVALIDATED", "STALE", "UPDATING"]) {
		expect(toEdgeCacheFailure({ status: 200, cacheStatus })).toBeNull()
	}

	// an error, and a response that did not pass through Cloudflare, fail
	expect(toEdgeCacheFailure({ status: 404, cacheStatus: "HIT" })).toBe("status 404")
	expect(toEdgeCacheFailure({ status: 200, cacheStatus: null })).toBe("no cf-cache-status header")
})

// a check that requires a hit fails on a miss
test("a required hit fails on any status but HIT", () => {
	expect(toEdgeCacheFailure({ status: 200, cacheStatus: "MISS", isHitRequired: true })).toBe("MISS")
	expect(toEdgeCacheFailure({ status: 200, cacheStatus: "hit", isHitRequired: true })).toBeNull()
})
