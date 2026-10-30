// the search request's url and tool forms, the bounds a request must stay within, and the results page
import { describe, expect, test } from "bun:test"
import {
	toPodcastEpisodeChapterFixture,
	toPodcastEpisodeFixture,
	toPodcastEpisodeSummaryFixture,
} from "./podcastEpisodeTestFixtures"
import {
	type SearchResultsPage,
	searchRequestPayload,
	searchResultsPage,
	toSearchPath,
	toSearchRequest,
	toSearchUrlParams,
} from "./search"

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

// the home espresso topic's latest podcast episode, as a summary and as the player shows it
const PODCAST_EPISODE_SUMMARY = toPodcastEpisodeSummaryFixture({
	title: "Burrs, measured",
	description: "Why aligned burrs fix uneven shots.",
	episodeNumber: 4,
	durationSeconds: 612,
	publishedAt: "2026-09-29T08:00:00.000Z",
	pagePath: "/topics/topic-home-espresso/home-espresso/episodes/4",
	chapterCount: 1,
})
const PODCAST_EPISODE = toPodcastEpisodeFixture({
	...PODCAST_EPISODE_SUMMARY,
	topicId: "topic-home-espresso",
	chapters: [
		toPodcastEpisodeChapterFixture({
			title: "Burrs, measured",
			findingId: "finding-grinder-burrs",
			sourceUrl: "https://example.com/grinder-burrs",
			endSeconds: 612,
		}),
	],
})

// one row of every kind, in the order the search ranks kinds
const SEARCH_PAGE: SearchResultsPage = {
	rows: [
		{
			kind: "topic",
			id: "topic-home-espresso",
			name: "Home espresso",
			path: "/topics/topic-home-espresso/home-espresso",
			date: "2026-05-18T12:00:00.000Z",
			count: 214,
			topic: { id: "topic-home-espresso", name: "Home espresso", latestPodcastEpisode: PODCAST_EPISODE_SUMMARY },
			subscriberCount: 31,
			isSubscribed: false,
		},
		{
			kind: "podcastEpisode",
			id: "episode-1",
			name: "Burrs, measured",
			path: "/topics/topic-home-espresso/home-espresso/episodes/4",
			date: "2026-09-29T08:00:00.000Z",
			count: 38,
			podcastEpisode: PODCAST_EPISODE_SUMMARY,
			topic: { id: "topic-home-espresso", name: "Home espresso" },
		},
		{
			kind: "finding",
			id: "finding-grinder-burrs",
			name: "Espresso grinder burrs, measured",
			path: "/topics/topic-home-espresso/home-espresso",
			date: "2026-09-28T12:00:00.000Z",
			count: 12,
			finding: {
				findingId: "finding-grinder-burrs",
				scanId: "scan-1",
				resourceId: "resource-1",
				url: "https://example.com/grinder-burrs",
				resourceKind: "read",
				title: "Espresso grinder burrs, measured",
				source: "example.com",
				faviconPath: null,
				publishedAt: "2026-09-27T12:00:00.000Z",
				fetchedAt: "2026-09-28T12:00:00.000Z",
				viewCount: 12,
				relevanceScore: 0.9,
				relevanceExplanation: "Measured burr alignment explains the uneven shots the topic keeps asking about.",
				rating: null,
				isConsumed: false,
				isBookmarked: false,
				teamBookmarks: [],
			},
			topic: {
				id: "topic-home-espresso",
				name: "Home espresso",
				prompt: "Home espresso gear and technique",
				visibility: "public",
				canRate: false,
				canBookmark: false,
			},
		},
		{
			kind: "team",
			id: "team-design-guild",
			name: "Design Guild",
			path: "/teams/team-design-guild",
			date: null,
			count: null,
			team: { teamId: "team-design-guild", name: "Design Guild", avatarVersion: null },
			topicCount: 4,
			memberCount: 12,
		},
		{
			kind: "user",
			id: "user-ava",
			name: "ava",
			path: "/profiles/user-ava",
			date: null,
			count: null,
			user: { userId: "user-ava", username: "ava", avatarSource: null, avatarVersion: null },
		},
	],
	rowCount: 5,
	page: 1,
	pageCount: 1,
	pageSize: 10,
	podcastEpisodes: [PODCAST_EPISODE],
}

describe("searchResultsPage", () => {
	test("parses a page with one row of every kind", () => {
		expect(searchResultsPage.parse(SEARCH_PAGE)).toEqual(SEARCH_PAGE)
	})

	test("rejects a row of a kind the build does not know", () => {
		const rows = [{ ...SEARCH_PAGE.rows[3], kind: "room" }]
		expect(searchResultsPage.safeParse({ ...SEARCH_PAGE, rows }).success).toBe(false)
	})
})
