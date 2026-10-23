// the site search: which kinds it reads, each kind's view rules for a visitor and a user, the finding reader's invite
// gate, and the route's rate limit
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { type SearchRequest, searchRequestPayload } from "@carlnotes/contracts/search"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { SEARCH_RATE_LIMIT } from "../rateLimit"
import * as topicHelpers from "../topic/helpers"
import { searchFindings } from "./findingSearch"
import { SEARCH_KIND_LIMIT, searchRoute, searchSite } from "./search"

// one Redis per test, so the rate limit counts from zero
beforeEach(() => {
	stubRedisClient()
})

// put everything back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// the statement that reads from a table, or undefined if none did
function findReadFrom(sentQueries: SentQuery[], tableName: string): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.includes(`from "${tableName}"`))
}

// a visitor's search for a query over some kinds
function toVisitorSearch(q: string, kinds?: string[]): Parameters<typeof searchSite>[0] {
	return { userId: null, clientAddress: null, searchRequest: searchRequestPayload.parse({ q, kinds }) }
}

test("a short query reads nothing and returns an empty page", async () => {
	const sentQueries = stubConnectionPool()
	expect(await searchSite(toVisitorSearch(" a "))).toEqual({
		rows: [],
		rowCount: 0,
		page: 1,
		pageCount: 1,
		pageSize: 10,
		podcastEpisodes: [],
	})
	expect(sentQueries).toHaveLength(0)
})

test("every kind is read by default, each up to the per-kind limit", async () => {
	const sentQueries = stubConnectionPool()
	await searchSite(toVisitorSearch("orbit"))
	for (const tableName of ["topics", "episodes", "resources", "teams", "users"]) {
		expect(findReadFrom(sentQueries, tableName)?.values).toContain(SEARCH_KIND_LIMIT)
	}
})

test("a kind filter reads only those kinds", async () => {
	// a search for teams and users
	const sentQueries = stubConnectionPool()
	await searchSite(toVisitorSearch("orbit", ["teams", "users"]))

	// those two kinds are read, and no other
	expect(findReadFrom(sentQueries, "teams")).toBeDefined()
	expect(findReadFrom(sentQueries, "users")).toBeDefined()
	expect(findReadFrom(sentQueries, "topics")).toBeUndefined()
	expect(findReadFrom(sentQueries, "episodes")).toBeUndefined()
	expect(findReadFrom(sentQueries, "resources")).toBeUndefined()
})

test("a visitor's finding read keeps public shown topics and shown findings alone", async () => {
	// a visitor's finding search
	const sentQueries = stubConnectionPool()
	await searchSite(toVisitorSearch("orbit", ["findings"]))

	// the title or url match, the shown findings, and the public topics, with none of a user's rules
	const findingRead = findReadFrom(sentQueries, "resources") as SentQuery
	expect(findingRead.text).toContain('lower(coalesce("resources"."title", "resources"."url")) like $')
	expect(findingRead.text).toContain(`"findings"."rating" is distinct from 'down'`)
	expect(findingRead.text).toContain('"topics"."visibility" = $')
	expect(findingRead.text).not.toContain('"topics"."owner_id" = $')
})

test("a member finds their own private teams, and a visitor the public teams alone", async () => {
	// a visitor's team read has no membership rule
	const visitorQueries = stubConnectionPool()
	await searchSite(toVisitorSearch("orbit", ["teams"]))
	expect(findReadFrom(visitorQueries, "teams")?.text).not.toContain('"team_members"')

	// a user's team read adds the teams they are an active member of
	const userQueries = stubConnectionPool()
	await searchSite({
		userId: "user-1",
		clientAddress: null,
		searchRequest: searchRequestPayload.parse({ q: "orbit", kinds: ["teams"] }),
	})
	const userTeamRead = userQueries.find((sentQuery) => sentQuery.text.includes('from "team_members"')) as SentQuery
	expect(userTeamRead.values).toContain("user-1")
})

// one finding row on an invite topic, in the order the finding search selects its columns: the finding, its scan, and
// its resource, its dates, notes, rating, and view count, the user's marks, its scan's start, and its topic
function toInviteFindingRow(findingId: string, scanStartedAt: string): unknown[] {
	const findingColumns = [findingId, "scan-1", `resource-${findingId}`, `https://example.com/${findingId}`]
	const resourceColumns = [`Orbit ${findingId}`, "read", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"]
	const noteColumns = [0.9, "Why it matters", 0, null, null, null]
	const topicColumns = ["topic-1", "Orbit", "Orbit news", "owner-1", "invite", null]
	return [...findingColumns, ...resourceColumns, ...noteColumns, scanStartedAt, ...topicColumns]
}

test("an invite subscriber finds only the findings from scans after their subscription activated", async () => {
	// two findings on one invite topic, one from a scan before the activation and one after
	stubConnectionPool(({ text }) =>
		text.includes('from "resources"')
			? [toInviteFindingRow("before", "2026-01-01T00:00:00Z"), toInviteFindingRow("after", "2026-03-01T00:00:00Z")]
			: [],
	)
	spyOn(topicHelpers, "topicSubscriptionStartDates").mockResolvedValue(
		new Map([["topic-1", new Date("2026-02-01T00:00:00Z")]]),
	)

	// the later finding alone, linked to its topic, with its notes, and no rating or bookmark for a non-member
	const findingSearchRows = await searchFindings({ userId: "user-1", isAdmin: false, query: "orbit", limit: 50 })
	expect(findingSearchRows.map((findingSearchRow) => findingSearchRow.id)).toEqual(["after"])
	expect(findingSearchRows[0]?.path).toBe("/topics/topic-1/orbit")
	expect(findingSearchRows[0]?.finding).toMatchObject({ relevanceExplanation: "Why it matters", isBookmarked: false })
	expect(findingSearchRows[0]?.topic).toMatchObject({ prompt: "Orbit news", canRate: false, canBookmark: false })
})

test("a two-character query reads no finding", async () => {
	const sentQueries = stubConnectionPool()
	expect(await searchFindings({ userId: "user-1", isAdmin: false, query: "or", limit: 50 })).toEqual([])
	expect(findReadFrom(sentQueries, "resources")).toBeUndefined()
})

test("a gated topic with no activation keeps none of its findings", async () => {
	stubConnectionPool(({ text }) =>
		text.includes('from "resources"') ? [toInviteFindingRow("f1", "2026-03-01T00:00:00Z")] : [],
	)
	spyOn(topicHelpers, "topicSubscriptionStartDates").mockResolvedValue(new Map([["topic-1", null]]))
	expect(await searchFindings({ userId: "user-1", isAdmin: false, query: "orbit", limit: 50 })).toEqual([])
})

test("a search past the limit is rejected with 429 and reads nothing", async () => {
	const sentQueries = stubConnectionPool()
	for (let i = 0; i < SEARCH_RATE_LIMIT; i++) {
		expect((await searchRoute.request("/search?q=x")).status).toBe(200)
	}
	expect((await searchRoute.request("/search?q=orbit")).status).toBe(429)
	expect(sentQueries).toHaveLength(0)
})

// a search request for a visitor or a user, with the filters it names
function toFilteredSearch(
	searchRequestFields: Partial<SearchRequest>,
	userId: string | null = null,
): Parameters<typeof searchSite>[0] {
	return {
		userId,
		clientAddress: null,
		searchRequest: searchRequestPayload.parse({ q: "orbit", ...searchRequestFields }),
	}
}

test("tags narrow topics, podcast episodes, and findings by their topic's tags", async () => {
	// any of the tags overlaps the topic's tags in every topic-bound read
	const sentQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ kinds: ["topics", "podcastEpisodes", "findings"], tags: ["ai"] }))
	for (const tableName of ["topics", "episodes", "resources"]) {
		expect(findReadFrom(sentQueries, tableName)?.text).toContain('"topics"."tags" && $')
	}

	// all of them is contained, and none of them is not overlapped
	const allTagQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ kinds: ["topics"], tags: ["ai", "coffee"], tagMatch: "all" }))
	expect(findReadFrom(allTagQueries, "topics")?.text).toContain('"topics"."tags" @> $')
	const noneTagQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ kinds: ["topics"], tags: ["ai"], tagMatch: "none" }))
	expect(findReadFrom(noneTagQueries, "topics")?.text).toContain('not "topics"."tags" && $')
})

test("tags a result must have leave out teams and profiles, and excluded tags keep them", async () => {
	// any or all of the tags reads no team and no user
	const anyTagQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ tags: ["ai"] }))
	expect(findReadFrom(anyTagQueries, "teams")).toBeUndefined()
	expect(findReadFrom(anyTagQueries, "users")).toBeUndefined()

	// none of the tags, and tags turned off, read both
	const noneTagQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ tags: ["ai"], tagMatch: "none" }))
	expect(findReadFrom(noneTagQueries, "teams")).toBeDefined()
	const offTagQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ tags: ["ai"], tagMatch: "off" }))
	expect(findReadFrom(offTagQueries, "users")).toBeDefined()
})

test("unread and bookmarked read the findings alone", async () => {
	for (const view of ["unread", "bookmarked"] as const) {
		// the finding reader runs, and the podcast episode and team readers do not
		const viewQueries = stubConnectionPool()
		await searchSite(toFilteredSearch({ view }, "user-1"))
		expect(findReadFrom(viewQueries, "resources")).toBeDefined()
		expect(findReadFrom(viewQueries, "episodes")).toBeUndefined()
		expect(findReadFrom(viewQueries, "teams")).toBeUndefined()
	}

	// the all view reads every kind
	const allQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({}, "user-1"))
	expect(findReadFrom(allQueries, "episodes")).toBeDefined()
	expect(findReadFrom(allQueries, "teams")).toBeDefined()
})

test("the resource kinds and the view narrow findings", async () => {
	// a resource kind and the unread view read the user's own consumed rows
	const unreadQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ kinds: ["findings"], resourceKinds: ["watch"], view: "unread" }, "user-1"))
	const unreadRead = findReadFrom(unreadQueries, "resources") as SentQuery
	expect(unreadRead.text).toContain('"resources"."kind" in ($')
	expect(unreadRead.text).toContain('not exists (select "finding_id" from "consumptions"')
	expect(unreadRead.values).toEqual(expect.arrayContaining(["watch", "user-1"]))

	// bookmarked reads the user's bookmarks, and a visitor's bookmarked finds none
	const bookmarkedQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ kinds: ["findings"], view: "bookmarked" }, "user-1"))
	expect(findReadFrom(bookmarkedQueries, "resources")?.text).toContain('exists (select "finding_id" from "bookmarks"')
	const visitorBookmarkedQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ kinds: ["findings"], view: "bookmarked" }))
	expect(findReadFrom(visitorBookmarkedQueries, "resources")?.text).toContain("false")

	// the all view never finds a finding rated thumbs down
	const allQueries = stubConnectionPool()
	await searchSite(toFilteredSearch({ kinds: ["findings"] }, "user-1"))
	expect(findReadFrom(allQueries, "resources")?.text).toContain(`"findings"."rating" is distinct from 'down'`)
})
