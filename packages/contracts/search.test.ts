// the search request's url and tool forms, and the bounds a request must stay within
import { describe, expect, test } from "bun:test"
import { searchRequestPayload, toSearchPath, toSearchRequest, toSearchUrlParams } from "./search"

describe("toSearchRequest", () => {
	test("a url's values and a tool's arguments read as the same search", () => {
		const urlSearchRequest = toSearchRequest({
			q: "orbit",
			kinds: "topics,podcastEpisodes",
			sort: "newest",
			page: "2",
			size: "25",
		})
		const toolSearchRequest = searchRequestPayload.parse({
			q: "orbit",
			kinds: ["topics", "podcastEpisodes"],
			sort: "newest",
			page: 2,
			size: 25,
		})
		expect(urlSearchRequest).toEqual(toolSearchRequest)
	})

	test("a value the contract rejects falls back to its default and keeps the rest", () => {
		const searchRequest = toSearchRequest({
			q: "orbit",
			kinds: "topics,planets",
			view: "starred",
			tags: "ai,coffee",
			sort: "loudest",
			page: "0",
			size: "7",
		})
		expect(searchRequest).toEqual(searchRequestPayload.parse({ q: "orbit", tags: ["ai", "coffee"] }))
	})

	test("an empty url is the default search", () => {
		expect(toSearchRequest({})).toEqual(searchRequestPayload.parse({}))
	})
})

describe("toSearchUrlParams", () => {
	test("a search round-trips through its url values", () => {
		const searchRequest = searchRequestPayload.parse({
			q: "orbit",
			kinds: ["teams"],
			resourceKinds: ["read", "watch"],
			view: "unread",
			tags: ["ai"],
			tagMatch: "all",
			sort: "trending",
			page: 3,
		})
		expect(toSearchRequest(toSearchUrlParams(searchRequest))).toEqual(searchRequest)
	})

	test("the defaults are left out of the path", () => {
		expect(toSearchPath(searchRequestPayload.parse({ q: "orbit" }))).toBe("/search?q=orbit")
		expect(toSearchPath(searchRequestPayload.parse({ q: "orbit", kinds: ["podcastEpisodes", "topics"] }))).toBe(
			"/search?q=orbit&kinds=topics%2CpodcastEpisodes",
		)
	})
})

describe("searchRequestPayload", () => {
	test("a list that repeats an item, or a NUL in the query or a tag, is rejected", () => {
		expect(searchRequestPayload.safeParse({ kinds: ["findings", "findings"] }).success).toBe(false)
		expect(searchRequestPayload.safeParse({ resourceKinds: ["read", "read"] }).success).toBe(false)
		expect(searchRequestPayload.safeParse({ q: "ab\u0000cd" }).success).toBe(false)
		expect(searchRequestPayload.safeParse({ tags: ["a\u0000b"] }).success).toBe(false)
	})

	test("a tag with a comma or a percent sign reads back as itself from the url", () => {
		const searchRequest = searchRequestPayload.parse({ q: "orbit", tags: ["research, policy", "100% done", "ai"] })
		expect(toSearchRequest(toSearchUrlParams(searchRequest)).tags).toEqual(["research, policy", "100% done", "ai"])
	})

	test("a url that repeats a kind reads as every kind", () => {
		expect(toSearchRequest({ q: "orbit", kinds: "findings,findings" }).kinds).toEqual([
			"topics",
			"podcastEpisodes",
			"findings",
			"teams",
			"users",
		])
	})
})
