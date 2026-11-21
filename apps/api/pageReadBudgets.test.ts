// query budgets for the page reads: each page read stays inside its query budget and its concurrent query bound, sends
// no query on a warm visitor copy, still counts a view POST after one, and is private to a session or a bearer token,
// and a view POST and the audio and film redirects are never shared. the signed-in home and one's own Activity read stay inside theirs
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { type PageReadKind, toPageReadRequestPaths } from "@carlnotes/contracts/pageReadRequests"
import { restoreConnectionPool, type SentQuery, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { runWithRequestMemo, runWithRowMemo } from "@carlnotes/db/requestMemo"
import { topics } from "@carlnotes/db/schema/topics"
import * as storage from "@carlnotes/db/store"
import * as viewerCounts from "@carlnotes/db/viewerCounts"
import { apiRoute } from "./api"
import { FIXTURE_DATE } from "./pageReadBudgetTestFixtures"
import * as podcastEpisodeRows from "./podcast/podcastEpisodeRows"
import { toPublishedPodcastEpisodeRow } from "./podcast/podcastEpisodeTestFixtures"
import * as topicVideoRoutes from "./podcast/topicVideoRoutes"
import * as topicVideos from "./podcast/topicVideos"
import {
	endQueryBudgetTest,
	PAGE_READ_PARAMS,
	requestAsUser,
	startQueryBudgetTest,
	stubBudgetConnectionPool,
	stubPageReadFixture,
	toBudgetQueryRows,
	toPageReadFixtureRows,
	trackMostConcurrentQueries,
} from "./queryBudgetsTestFixtures"
import { signInAs } from "./testSession"

// the queries the stubbed connection pool was sent, from the start of the test
let sentQueries: SentQuery[] = []

// one Redis with the related reads' centroid stored and one stubbed connection pool per test, with the console quiet
beforeEach(() => {
	sentQueries = startQueryBudgetTest()
})

// everything back after each test
afterEach(() => {
	endQueryBudgetTest()
	mock.restore()
})

// each page read's most queries on a visitor's cold read of this fixture, and the most of them in flight at once
const PAGE_READ_BUDGETS: Record<PageReadKind, { maxQueries: number; maxConcurrentQueries: number }> = {
	profile: { maxQueries: 15, maxConcurrentQueries: 10 },
	team: { maxQueries: 11, maxConcurrentQueries: 8 },
	home: { maxQueries: 10, maxConcurrentQueries: 9 },
	topic: { maxQueries: 24, maxConcurrentQueries: 9 },
	podcastEpisode: { maxQueries: 19, maxConcurrentQueries: 5 },
	topicPost: { maxQueries: 8, maxConcurrentQueries: 3 },
	dashboard: { maxQueries: 4, maxConcurrentQueries: 3 },
}

// each page read's cold visitor read stays inside its query budget and its concurrent query bound, a GET request read
// with the row memo the server opens for it
test.each(Object.keys(PAGE_READ_BUDGETS) as PageReadKind[])(
	"the %s page read stays inside its query budget and its concurrent query bound",
	async (pageReadKind) => {
		// the fixture with a row behind each page's first branches
		sentQueries = stubPageReadFixture()
		const toMostConcurrentQueryCount = trackMostConcurrentQueries()

		// a visitor's request of the page read, which finds the page
		const [requestPath = ""] = toPageReadRequestPaths(pageReadKind, PAGE_READ_PARAMS[pageReadKind])
		signInAs(null)
		const queryCountBefore = sentQueries.length
		const response = await runWithRequestMemo(() => runWithRowMemo(async () => apiRoute.request(requestPath)))
		expect(response.status).toBe(200)

		// its queries and its most concurrent queries inside the page's budget
		const queryCount = sentQueries.length - queryCountBefore
		expect(queryCount).toBeLessThanOrEqual(PAGE_READ_BUDGETS[pageReadKind].maxQueries)
		expect(toMostConcurrentQueryCount()).toBeLessThanOrEqual(PAGE_READ_BUDGETS[pageReadKind].maxConcurrentQueries)
	},
)

// the signed-in home's most queries on this fixture, with the user's own topic, a home topic, a home podcast episode
// with a ready film, and a home Topic Post, and the most of them in flight at once. a cold read counts the ten
// reads of the home's ids, which every reader shares for a minute, and a read on the shared ids counts the rest
const SIGNED_IN_HOME_BUDGET = { maxQueries: 21, maxSharedIdsQueries: 11, maxConcurrentQueries: 11 }

// the signed-in home's rows: the cached ids name one card of each kind, and the user owns one topic
function toSignedInHomeRows(sentQuery: SentQuery): unknown[] {
	const { text } = sentQuery

	// the home's ids: a home topic, a home podcast episode, and a home Topic Post
	if (text.startsWith('select "id" from "topics" where (("topics"."visibility"')) {
		return [["topic-2"]]
	}
	if (text.startsWith('select "episodes"."id", "episodes"."topic_id" from "episodes" inner join "topics"')) {
		return [["episode-1", "topic-1"]]
	}

	// the home Topic Post's id
	if (text.startsWith('select "topic_posts"."id", "topic_posts"."topic_id" from "topic_posts"')) {
		return [["post-1", "topic-1"]]
	}

	// the home podcast episode with its topic, which is also the user's topic's latest, and has a ready film
	const podcastEpisodeRow = toPublishedPodcastEpisodeRow({ id: "episode-1", topicId: "topic-1", episodeNumber: 1 })
	if (text.includes('from "episodes" inner join "topics"') && sentQuery.values.includes("episode-1")) {
		return [[...podcastEpisodeRow, "topic-1", "Agents", "public", null]]
	}

	// the user's topic's latest podcast episode
	if (text.includes('"latest_podcast_episodes" on true')) {
		return [podcastEpisodeRow]
	}

	// the home topic's row, and the user's own topic and how many there are
	const topicFields = { visibility: "public", isPodcastEnabled: true, createdAt: FIXTURE_DATE } as const
	if (text.includes('from "topics" where "topics"."id" in ($1)') && sentQuery.values.includes("topic-2")) {
		return [toTableRow(topics, { id: "topic-2", ownerId: "owner-2", name: "Espresso", ...topicFields })]
	}
	if (text.includes('order by "topics"."owner_id" = $')) {
		return [toTableRow(topics, { id: "topic-1", ownerId: "user-1", name: "Agents", ...topicFields })]
	}

	// how many topics the user owns or follows
	if (text.startsWith('select count(*) from "topics"')) {
		return [[1]]
	}
	return toPageReadFixtureRows(sentQuery)
}

// the signed-in home reads every card of every kind together, inside its query budget and its concurrent query bound
test("the signed-in home read stays inside its query budget and its concurrent query bound", async () => {
	// the fixture with a card of every kind and the user's own topic
	stubPageReadFixture()
	restoreConnectionPool()
	sentQueries = stubBudgetConnectionPool(toSignedInHomeRows)
	const toMostConcurrentQueryCount = trackMostConcurrentQueries()

	// the user's home read, with the user's topic among the cards
	const { response, queryCount } = await requestAsUser("/api/home", "user-1")
	expect(response.status).toBe(200)
	const home = (await response.json()) as { yourTopics: { totalCount: number } | null }
	expect(home.yourTopics?.totalCount).toBe(1)
	expect(queryCount).toBeLessThanOrEqual(SIGNED_IN_HOME_BUDGET.maxQueries)
	expect(toMostConcurrentQueryCount()).toBeLessThanOrEqual(SIGNED_IN_HOME_BUDGET.maxConcurrentQueries)

	// a second read takes the home's ids from the shared copy
	const sharedIdsRequest = await requestAsUser("/api/home", "user-1")
	expect(sharedIdsRequest.response.status).toBe(200)
	expect(sharedIdsRequest.queryCount).toBeLessThanOrEqual(SIGNED_IN_HOME_BUDGET.maxSharedIdsQueries)
})

// each page read's visitor copy is built once and then served from Redis, so a warm read sends no query and returns
// the same page
test.each(Object.keys(PAGE_READ_BUDGETS) as PageReadKind[])(
	"the %s page read sends no query on a warm visitor copy",
	async (pageReadKind) => {
		// a visitor's cold read and warm read of the page read, on the fixture with a row behind each page
		sentQueries = stubPageReadFixture()
		const [requestPath = ""] = toPageReadRequestPaths(pageReadKind, PAGE_READ_PARAMS[pageReadKind])
		const coldRequest = await requestAsUser(requestPath, null)
		const warmRequest = await requestAsUser(requestPath, null)

		// the cold read built a page, and the warm read sent nothing and returned it again
		expect(coldRequest.response.status).toBe(200)
		expect(coldRequest.queryCount).toBeGreaterThan(0)
		expect(warmRequest.queryCount).toBe(0)
		expect(await warmRequest.response.json()).toEqual(await coldRequest.response.json())
	},
)

// the view POST of each page that posts its view, the kind its count counts, and the page read's kind and id
const PAGE_VIEW_POSTS = [
	{
		pageReadKind: "profile",
		viewPath: "/api/profiles/owner-1/view",
		viewerCountRef: { kind: "profile", id: "owner-1" },
	},
	{ pageReadKind: "team", viewPath: "/api/teams/team-1/view", viewerCountRef: { kind: "team", id: "team-1" } },
	{ pageReadKind: "topic", viewPath: "/api/topics/topic-1/view", viewerCountRef: { kind: "topic", id: "topic-1" } },
	{
		pageReadKind: "topicPost",
		viewPath: "/api/topicPosts/post-1/view",
		viewerCountRef: { kind: "topicPost", id: "post-1" },
	},
] as const

// a page read served from its visitor copy sends no query, but the page's view POST still counts the view
test.each(PAGE_VIEW_POSTS)(
	"a $pageReadKind view POST after a cached page read still counts its view",
	async ({ pageReadKind, viewPath, viewerCountRef }) => {
		// the page read's copy filled, then read warm
		sentQueries = stubPageReadFixture()
		const [requestPath = ""] = toPageReadRequestPaths(pageReadKind, PAGE_READ_PARAMS[pageReadKind])
		await requestAsUser(requestPath, null)
		expect((await requestAsUser(requestPath, null)).queryCount).toBe(0)

		// the browser's view POST from the app's own origin counts the view
		const addViewerSpy = spyOn(viewerCounts, "addViewer").mockResolvedValue(undefined)
		const viewResponse = await apiRoute.request(viewPath, {
			method: "POST",
			headers: { "user-agent": "Mozilla/5.0 Firefox/130.0", "sec-fetch-site": "same-origin" },
		})
		expect(viewResponse.status).toBe(204)
		expect(addViewerSpy.mock.calls.map(([countedRef]) => countedRef)).toEqual([viewerCountRef])
	},
)

// with the page reads' edge setting on, a visitor's page read is shared at the edge, and a read that a session cookie
// or a bearer token shaped is private and carries no edge header
test.each(Object.keys(PAGE_READ_BUDGETS) as PageReadKind[])(
	"the %s page read is private for a session or a bearer token while a visitor's is shared",
	async (pageReadKind) => {
		// the fixture, with the page reads shared at the edge
		sentQueries = stubPageReadFixture()
		Bun.env.PAGE_READS_EDGE_CACHED = "true"
		const [requestPath = ""] = toPageReadRequestPaths(pageReadKind, PAGE_READ_PARAMS[pageReadKind])

		// a visitor's read is shared
		const visitorRequest = await requestAsUser(requestPath, null)
		expect(visitorRequest.response.status).toBe(200)
		expect(visitorRequest.response.headers.get("CDN-Cache-Control")).not.toBeNull()

		// a read with a session cookie or a bearer token is private
		const credentialHeaderLists: Record<string, string>[] = [
			{ cookie: "better-auth.session_token=abc" },
			{ authorization: "Bearer token-1" },
		]
		for (const credentialHeaders of credentialHeaderLists) {
			const response = await runWithRequestMemo(() => apiRoute.request(requestPath, { headers: credentialHeaders }))
			expect(response.headers.get("Cache-Control")).toStartWith("private")
			expect(response.headers.get("CDN-Cache-Control")).toBeNull()
		}
	},
)

// a page's view POST, its podcast episode's audio redirect, and its film redirect never carry a shared cache header, even with
// the page reads' edge setting on
test("a view POST and the audio and film redirects are never shared at the edge", async () => {
	// a public topic's published podcast episode with a ready film, and the signed url each redirect sends to
	sentQueries = stubPageReadFixture()
	Bun.env.PAGE_READS_EDGE_CACHED = "true"
	signInAs(null)
	spyOn(podcastEpisodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue({
		podcastEpisodeRow: { id: "episode-1", topicId: "topic-1", audioKey: "audio-key", audioByteSize: 1 },
		topic: { id: "topic-1", visibility: "public" },
	} as never)
	spyOn(topicVideos, "loadReadyTopicVideoFiles").mockResolvedValue({ filmKey: "film-key", byteSize: 1 } as never)
	spyOn(topicVideoRoutes, "startStaleFilmRebuild").mockResolvedValue(undefined)
	spyOn(storage, "toPodcastEpisodeFileUrl").mockReturnValue("https://media.example/file?X-Amz-Signature=private")
	spyOn(viewerCounts, "addViewer").mockResolvedValue(undefined)

	// the view POST, the audio redirect, and the film redirect, each sent as a visitor's browser sends it
	const browserHeaders = { "user-agent": "Mozilla/5.0 Firefox/130.0", "sec-fetch-site": "same-origin" }
	const responses = [
		await apiRoute.request("/api/topics/topic-1/view", { method: "POST", headers: browserHeaders }),
		await apiRoute.request("/api/episodes/episode-1/audio.mp3", { headers: browserHeaders }),
		await apiRoute.request("/api/episodes/episode-1/video.mp4", { headers: browserHeaders }),
	]
	expect(responses.map((response) => response.status)).toEqual([204, 302, 302])

	// none of them is shared at the edge or by any other cache
	for (const response of responses) {
		expect(response.headers.get("CDN-Cache-Control")).toBeNull()
		expect(response.headers.get("Cache-Tag")).toBeNull()
		expect(response.headers.get("Cache-Control") ?? "private").not.toContain("public")
	}
})

// the most queries one's own Activity read sends at once, held at the profile page read's concurrent query bound
const MAX_ACTIVITY_CONCURRENT_QUERIES = PAGE_READ_BUDGETS.profile.maxConcurrentQueries

test("one's own Activity read keeps its concurrent queries inside the page reads' bound", async () => {
	// the user owns one topic, so the owned topic reads run too
	sentQueries = stubBudgetConnectionPool((sentQuery) =>
		sentQuery.text.startsWith('select "id" from "topics" where "topics"."owner_id" = $1')
			? [["topic-1"]]
			: toBudgetQueryRows(sentQuery),
	)
	const toMostConcurrentQueryCount = trackMostConcurrentQueries()

	// the Activity read, with its spend sums apart from its other reads
	const { response } = await requestAsUser("/api/activity", "user-1")
	expect(response.status).toBe(200)
	expect(toMostConcurrentQueryCount()).toBeLessThanOrEqual(MAX_ACTIVITY_CONCURRENT_QUERIES)
	expect(toMostConcurrentQueryCount()).toBeGreaterThan(1)
})
