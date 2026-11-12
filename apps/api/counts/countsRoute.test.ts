// counts route tests: a topic view returns 204 and counts only a person who may view the topic, from the app's own
// origin and within the rate limit, the counts read is shared at the edge for a public topic and private for any
// other, a Topic Post's view and counts read follow the same rules, and a view or a play counts once into the day's
// daily count buffer

import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { ZURICH_PLACE } from "@carlnotes/contracts/placeTestFixtures"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { takeDailyCountEntries } from "@carlnotes/db/dailyCountBuffer"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import { readViewerEstimate } from "@carlnotes/db/viewerCounts"
import * as requestPlace from "../requestPlace"
import type { TopicPostRow } from "../topicPost/topicPosts"
import * as topicPosts from "../topicPost/topicPosts"
import { countsRoute } from "./countsRoute"
import { countPodcastEpisodeListen } from "./viewerCounts"

// the topic the tests view, and a browser's and a crawler's same-origin requests, each with its address
const TOPIC = { kind: "topic", id: "topic-1" } as const
const BROWSER_HEADERS = {
	"user-agent": "Mozilla/5.0 Firefox/130.0",
	"x-forwarded-for": "203.0.113.7",
	"sec-fetch-site": "same-origin",
}
const CRAWLER_HEADERS = {
	"user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
	"x-forwarded-for": "203.0.113.8",
	"sec-fetch-site": "same-origin",
}

// the auth secret that keys a visitor's hash, set for each test and put back after
let savedAuthSecret: string | undefined

beforeEach(() => {
	savedAuthSecret = Bun.env.BETTER_AUTH_SECRET
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

afterEach(() => {
	Bun.env.BETTER_AUTH_SECRET = savedAuthSecret
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// a topic row with the given visibility, its saved viewer count, and its followers
function stubTopicRow(visibility: "public" | "private", viewerCount = 0): void {
	stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "topics"') ? [["topic-1", "owner-1", visibility, null, viewerCount, 4]] : [],
	)
}

test("a visitor's view of a public topic counts once, and a repeat adds nothing", async () => {
	stubRedisClient()
	stubTopicRow("public")
	const firstResponse = await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })
	await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(firstResponse.status).toBe(204)
	expect(await readViewerEstimate(TOPIC)).toBe(1)
})

test("a crawler's view and a visitor's view of a private topic return 204 and count nothing", async () => {
	stubRedisClient()
	stubTopicRow("public")
	const crawlerResponse = await countsRoute.request("/topics/topic-1/view", {
		method: "POST",
		headers: CRAWLER_HEADERS,
	})
	expect(crawlerResponse.status).toBe(204)

	// a private topic looks the same to a visitor as one that counted
	stubTopicRow("private")
	const privateResponse = await countsRoute.request("/topics/topic-1/view", {
		method: "POST",
		headers: BROWSER_HEADERS,
	})
	expect(privateResponse.status).toBe(204)
	expect(await readViewerEstimate(TOPIC)).toBe(0)
})

test("a view that another website sends returns 204 and counts nothing", async () => {
	stubRedisClient()
	stubTopicRow("public")
	const crossSiteResponse = await countsRoute.request("/topics/topic-1/view", {
		method: "POST",
		headers: { ...BROWSER_HEADERS, "sec-fetch-site": "cross-site" },
	})
	expect(crossSiteResponse.status).toBe(204)
	expect(await readViewerEstimate(TOPIC)).toBe(0)
})

test("one address that cycles user agents counts at most 30 views a minute", async () => {
	stubRedisClient()
	stubTopicRow("public")
	for (let i = 0; i < 31; i++) {
		await countsRoute.request("/topics/topic-1/view", {
			method: "POST",
			headers: { ...BROWSER_HEADERS, "user-agent": `Mozilla/5.0 Firefox/${i}.0` },
		})
	}
	expect(await readViewerEstimate(TOPIC)).toBe(30)
})

test("an unreachable Redis still returns 204 for the view", async () => {
	stubUnreachableRedisClient()
	stubTopicRow("public")
	const response = await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(response.status).toBe(204)
})

test("a public topic's counts are shared at the edge, and never lower than the saved column", async () => {
	stubRedisClient()
	stubTopicRow("public", 5)
	const response = await countsRoute.request("/counts/topics/topic-1")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ viewerCount: 5, subscriberCount: 4 })

	// the browser revalidates, and the edge shares the counts for thirty seconds
	expect(response.headers.get("Cache-Control")).toBe("no-cache")
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=30")
})

test("a private topic's counts are hidden from a visitor and never shared", async () => {
	stubRedisClient()
	stubTopicRow("private")
	const response = await countsRoute.request("/counts/topics/topic-1")
	expect(response.status).toBe(404)
	expect(response.headers.get("Cache-Control")).toBe("private, no-cache")
	expect(response.headers.get("CDN-Cache-Control")).toBeNull()
})

// the profile and the team the tests view
const PROFILE = { kind: "profile", id: "user-1" } as const
const TEAM = { kind: "team", id: "team-1" } as const

// a user row for the profile, as the view's lookup and the counts read each select one column of it
function stubUserRow(profileViewerCount = 0): void {
	stubConnectionPool((sentQuery) => {
		if (!sentQuery.text.includes('from "users"')) {
			return []
		}
		return sentQuery.text.includes('"profile_viewer_count"') ? [[profileViewerCount]] : [["user-1"]]
	})
}

// a team row with no membership row for the sender, in the team page access read's column order
function stubTeamRow(isPublic: boolean, viewerCount = 0): void {
	stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "teams"')
			? [["team-1", "Reading Club", null, null, isPublic, viewerCount, new Date(), null, null]]
			: [],
	)
}

test("a visitor's view of a profile counts once, and a repeat adds nothing", async () => {
	stubRedisClient()
	stubUserRow()
	const firstResponse = await countsRoute.request("/profiles/user-1/view", { method: "POST", headers: BROWSER_HEADERS })
	await countsRoute.request("/profiles/user-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(firstResponse.status).toBe(204)
	expect(await readViewerEstimate(PROFILE)).toBe(1)
})

test("a crawler's view of a profile and a view of no user return 204 and count nothing", async () => {
	stubRedisClient()
	stubUserRow()
	const crawlerResponse = await countsRoute.request("/profiles/user-1/view", {
		method: "POST",
		headers: CRAWLER_HEADERS,
	})
	expect(crawlerResponse.status).toBe(204)

	// an id that names no user looks the same as one that counted
	stubConnectionPool(() => [])
	const missingResponse = await countsRoute.request("/profiles/user-1/view", {
		method: "POST",
		headers: BROWSER_HEADERS,
	})
	expect(missingResponse.status).toBe(204)
	expect(await readViewerEstimate(PROFILE)).toBe(0)
})

test("one address counts at most 30 profile views a minute, and an unreachable Redis still returns 204", async () => {
	stubRedisClient()
	stubUserRow()
	for (let i = 0; i < 31; i++) {
		await countsRoute.request("/profiles/user-1/view", {
			method: "POST",
			headers: { ...BROWSER_HEADERS, "user-agent": `Mozilla/5.0 Firefox/${i}.0` },
		})
	}
	expect(await readViewerEstimate(PROFILE)).toBe(30)

	// a view with Redis down is lost and the response is the same
	stubUnreachableRedisClient()
	const response = await countsRoute.request("/profiles/user-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(response.status).toBe(204)
})

test("a visitor's view counts on a public team and not on a private one", async () => {
	stubRedisClient()
	stubTeamRow(false)
	const privateResponse = await countsRoute.request("/teams/team-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(privateResponse.status).toBe(204)
	expect(await readViewerEstimate(TEAM)).toBe(0)

	// the same visitor counts once the team is public
	stubTeamRow(true)
	const publicResponse = await countsRoute.request("/teams/team-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(publicResponse.status).toBe(204)
	expect(await readViewerEstimate(TEAM)).toBe(1)
})

test("a profile's count is shared at the edge, and never lower than the saved column", async () => {
	stubRedisClient()
	stubUserRow(5)
	const response = await countsRoute.request("/counts/profiles/user-1")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ viewerCount: 5 })
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=30")
})

test("a public team's count is shared, and a private team's is hidden from a visitor", async () => {
	stubRedisClient()
	stubTeamRow(true, 3)
	const publicResponse = await countsRoute.request("/counts/teams/team-1")
	expect(await publicResponse.json()).toEqual({ viewerCount: 3 })
	expect(publicResponse.headers.get("CDN-Cache-Control")).toBe("max-age=30")

	// a private team reads as missing, and the response is never shared
	stubTeamRow(false, 3)
	const privateResponse = await countsRoute.request("/counts/teams/team-1")
	expect(privateResponse.status).toBe(404)
	expect(privateResponse.headers.get("Cache-Control")).toBe("private, no-cache")
})

// the Topic Post the tests view, published on a public Topic with five saved viewers
const TOPIC_POST = { kind: "topicPost", id: "post-1" } as const
const TOPIC_POST_ROW = {
	topicPost: { id: "post-1", topicId: "topic-1", authorUserId: "author-1", publishedAt: new Date(), viewerCount: 5 },
	topic: { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: null },
	author: { userId: "author-1", username: "author-1", avatarSource: "generated", avatarKey: null },
} as TopicPostRow

// the Topic Post's read, on a Topic of the given visibility, and no row for any other read
function stubTopicPost(visibility: "public" | "private"): void {
	stubConnectionPool()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue({
		...TOPIC_POST_ROW,
		topic: { ...TOPIC_POST_ROW.topic, visibility },
	})
}

test("a visitor's reloads of a public Topic Post count once", async () => {
	stubRedisClient()
	stubTopicPost("public")
	for (let reload = 0; reload < 10; reload++) {
		const response = await countsRoute.request("/topicPosts/post-1/view", { method: "POST", headers: BROWSER_HEADERS })
		expect(response.status).toBe(204)
	}

	// the ten reloads count one viewer
	expect(await readViewerEstimate(TOPIC_POST)).toBe(1)
})

test("a view of a Topic Post the sender may not read returns 204 and counts nothing", async () => {
	stubRedisClient()
	stubTopicPost("private")
	const response = await countsRoute.request("/topicPosts/post-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(response.status).toBe(204)
	expect(await readViewerEstimate(TOPIC_POST)).toBe(0)
})

test("a public Topic Post's count is shared, and a private Topic Post's reads as missing", async () => {
	stubRedisClient()
	stubTopicPost("public")
	const publicResponse = await countsRoute.request("/counts/topicPosts/post-1")
	expect(await publicResponse.json()).toEqual({ viewerCount: 5 })
	expect(publicResponse.headers.get("CDN-Cache-Control")).toBe("max-age=30")

	// a Topic Post on a private Topic reads as missing, and the response is never shared
	stubTopicPost("private")
	const privateResponse = await countsRoute.request("/counts/topicPosts/post-1")
	expect(privateResponse.status).toBe(404)
	expect(privateResponse.headers.get("Cache-Control")).toBe("private, no-cache")
})

test("a topic view and a Topic Post view each count once into the day's buffer with the request's place", async () => {
	stubRedisClient()
	stubTopicRow("public")
	spyOn(requestPlace, "readRequestPlace").mockReturnValue(ZURICH_PLACE)
	await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })
	await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })

	// the Topic Post's view, on the same day and from the same place
	stubTopicPost("public")
	await countsRoute.request("/topicPosts/post-1/view", { method: "POST", headers: BROWSER_HEADERS })
	const dailyCountEntries = (await takeDailyCountEntries()) ?? []
	expect(dailyCountEntries.map(({ dailyCountRow, count }) => [dailyCountRow, count])).toEqual([
		[{ dailyCountKind: "view", itemKind: "topic", itemId: "topic-1", day: expect.any(String), place: ZURICH_PLACE }, 1],
		[
			{ dailyCountKind: "view", itemKind: "topicPost", itemId: "post-1", day: expect.any(String), place: ZURICH_PLACE },
			1,
		],
	])
})

test("a play counts into the day's buffer in its format, once for a retried download", async () => {
	stubRedisClient()
	const requestSender = { userId: "listener-1", clientAddress: null, userAgent: "Overcast/3.0", place: ZURICH_PLACE }
	await countPodcastEpisodeListen({ requestSender, podcastEpisodeId: "episode-1", format: "video" })
	await countPodcastEpisodeListen({ requestSender, podcastEpisodeId: "episode-1", format: "video" })

	// one play in the buffer, in its format
	const [dailyCountEntry] = (await takeDailyCountEntries()) ?? []
	expect(dailyCountEntry?.count).toBe(1)
	expect(dailyCountEntry?.dailyCountRow).toMatchObject({
		dailyCountKind: "play",
		podcastEpisodeId: "episode-1",
		format: "video",
	})
})
