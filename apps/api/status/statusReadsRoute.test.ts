// status read route tests: each read returns its subject's status alone, a public subject's status goes to anyone and
// may be shared at the edge, any other passes the page's own access check or reads as missing, and a read while Redis
// is down falls back to the row
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import * as dbAuthorization from "@carlnotes/db/authorization"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import * as podcastEpisodeSettings from "@carlnotes/server/podcastEpisodeSettings"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import * as podcastEpisodeRows from "../podcast/podcastEpisodeRows"
import { toSignedInApp } from "../testSession"
import * as topicPosts from "../topicPost/topicPosts"
import { statusReadsRoute } from "./statusReadsRoute"

// a visitor's app, with no user signed in
const VISITOR_APP = new Hono<AppEnv>().route("/", statusReadsRoute)

// a Topic's access columns in their select order: id, owner, visibility, and team
function toTopicAccessRow(visibility: "public" | "private"): unknown[] {
	return ["topic-1", "owner-1", visibility, null]
}

// the rows each status read's queries return, by the table its select reads from
type StatusRows = {
	topicVisibility: "public" | "private"
	topicVideoStatus?: string | null
	topicPostPublishedAt?: string | null
	discussionStatus?: string
	scan?: unknown[]
	podcastEpisodeStatus?: string
}

// stub the connection pool with one Topic's status rows, each select's rows by the table it reads from, and return the
// queries it receives
function stubStatusRows(statusRows: StatusRows): SentQuery[] {
	const topicAccessRow = toTopicAccessRow(statusRows.topicVisibility)
	const rowsByTableClause: [string, unknown[][]][] = [
		// the film's status beside its podcast episode's status and its Topic's access columns
		['"topic_videos"', [[statusRows.topicVideoStatus ?? null, "published", ...topicAccessRow]]],
		// the post with its Topic's columns, then its newest discussion's status
		[
			'from "topic_posts"',
			[[statusRows.topicPostPublishedAt ?? null, "author-1", ...topicAccessRow, "Espresso", null]],
		],
		['from "topic_post_discussions"', statusRows.discussionStatus ? [[statusRows.discussionStatus]] : []],
		// the Topic's latest Scan, its newest podcast episode, and its access columns
		['from "scans"', statusRows.scan ? [statusRows.scan] : []],
		['from "episodes"', statusRows.podcastEpisodeStatus ? [[statusRows.podcastEpisodeStatus]] : []],
		['from "topics"', [topicAccessRow]],
	]
	return stubConnectionPool(
		({ text }) => rowsByTableClause.find(([tableClause]) => text.includes(tableClause))?.[1] ?? [],
	)
}

// an in-memory Redis for each test, and the stubs put back after it
beforeEach(() => {
	stubRedisClient()
	spyOn(podcastEpisodeSettings, "isPodcastEpisodeRecordingConfigured").mockReturnValue(true)
})
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

test("a public film's status goes to a visitor alone, without the podcast episode's access check", async () => {
	stubStatusRows({ topicVisibility: "public", topicVideoStatus: "rendering" })
	const loadAccessiblePodcastEpisodeSpy = spyOn(podcastEpisodeRows, "loadAccessiblePodcastEpisode")

	// the status alone, and no access check
	const response = await VISITOR_APP.request("/status/episodes/episode-1/topic-video")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ status: "rendering" })
	expect(loadAccessiblePodcastEpisodeSpy).not.toHaveBeenCalled()
})

test("a podcast episode with no film reads none, and a private film goes through the podcast episode's access check", async () => {
	stubStatusRows({ topicVisibility: "private", topicVideoStatus: null })
	const loadAccessiblePodcastEpisodeSpy = spyOn(podcastEpisodeRows, "loadAccessiblePodcastEpisode")

	// a listener who passes the check reads none for a podcast episode with no film
	loadAccessiblePodcastEpisodeSpy.mockResolvedValueOnce({} as never)
	const allowedResponse = await toSignedInApp(statusReadsRoute, "listener-1").request(
		"/status/episodes/episode-1/topic-video",
	)
	expect(await allowedResponse.json()).toEqual({ status: "none" })
	expect(loadAccessiblePodcastEpisodeSpy).toHaveBeenCalledWith({ userId: "listener-1", podcastEpisodeId: "episode-1" })

	// a visitor who fails it reads it as missing, and the response stays private
	loadAccessiblePodcastEpisodeSpy.mockResolvedValueOnce(null as never)
	const hiddenResponse = await VISITOR_APP.request("/status/episodes/episode-1/topic-video")
	expect(hiddenResponse.status).toBe(404)
	expect(hiddenResponse.headers.get("Cache-Control")).toBe("private, no-cache")
})

test("a published post's discussion status goes to anyone, and a draft's through the post's read check", async () => {
	// a published post on a public Topic, read by a visitor
	stubStatusRows({
		topicVisibility: "public",
		topicPostPublishedAt: "2026-11-01T00:00:00.000Z",
		discussionStatus: "recording",
	})
	const canReadTopicPostSpy = spyOn(topicPosts, "canReadTopicPost").mockResolvedValue(false)
	const publicResponse = await VISITOR_APP.request("/status/topic-posts/post-1/discussion")
	expect(await publicResponse.json()).toEqual({ status: "recording" })
	expect(canReadTopicPostSpy).not.toHaveBeenCalled()

	// a draft with no discussion, read by a visitor who fails the check, then by its author who passes it
	restoreRedisClient()
	stubRedisClient()
	stubStatusRows({ topicVisibility: "public", topicPostPublishedAt: null })
	expect((await VISITOR_APP.request("/status/topic-posts/post-2/discussion")).status).toBe(404)
	canReadTopicPostSpy.mockResolvedValue(true)
	const authorResponse = await toSignedInApp(statusReadsRoute, "author-1").request(
		"/status/topic-posts/post-2/discussion",
	)
	expect(await authorResponse.json()).toEqual({ status: "none" })
})

test("a Topic's scan status names its latest Scan with its counts and its newest podcast episode's status", async () => {
	stubStatusRows({
		topicVisibility: "public",
		scan: ["scan-1", "running", 12, 3],
		podcastEpisodeStatus: "recording",
	})

	// the latest Scan and the podcast episode's status alone
	const response = await VISITOR_APP.request("/status/topics/topic-1/scan")
	expect(await response.json()).toEqual({
		scan: { id: "scan-1", status: "running", foundCount: 12, keptCount: 3 },
		podcastEpisodeStatus: "recording",
	})
})

test("a private Topic's scan status goes through the Topic's view check, and a missing Topic reads as missing", async () => {
	stubStatusRows({ topicVisibility: "private" })
	const isAllowedSpy = spyOn(dbAuthorization, "isAllowed")

	// a reader who may not view the Topic reads it as missing, and one who may reads a Topic with no Scan
	isAllowedSpy.mockResolvedValueOnce(false)
	expect((await toSignedInApp(statusReadsRoute, "stranger-1").request("/status/topics/topic-1/scan")).status).toBe(404)
	isAllowedSpy.mockResolvedValueOnce(true)
	const memberResponse = await toSignedInApp(statusReadsRoute, "member-1").request("/status/topics/topic-1/scan")
	expect(await memberResponse.json()).toEqual({ scan: null, podcastEpisodeStatus: null })
	expect(isAllowedSpy).toHaveBeenLastCalledWith("member-1", "topic:view", expect.objectContaining({ id: "topic-1" }))

	// a Topic that does not exist
	restoreRedisClient()
	stubRedisClient()
	stubConnectionPool(() => [])
	expect((await VISITOR_APP.request("/status/topics/topic-2/scan")).status).toBe(404)
})

test("a status read loads its row once into its status copy, and loads the row each time while Redis is down", async () => {
	const sentQueries = stubStatusRows({ topicVisibility: "public", scan: ["scan-1", "running", 1, 0] })

	// two reads with Redis up send the Topic's three selects once
	await VISITOR_APP.request("/status/topics/topic-1/scan")
	await VISITOR_APP.request("/status/topics/topic-1/scan")
	expect(sentQueries).toHaveLength(3)

	// two reads while Redis is down each read the rows and still return the status
	stubUnreachableRedisClient()
	const responses = [
		await VISITOR_APP.request("/status/topics/topic-1/scan"),
		await VISITOR_APP.request("/status/topics/topic-1/scan"),
	]
	expect(sentQueries).toHaveLength(9)
	for (const response of responses) {
		expect(((await response.json()) as { scan: { status: string } }).scan.status).toBe("running")
	}
})

test("a film's and a discussion's status are each loaded once into their status copy", async () => {
	const sentQueries = stubStatusRows({
		topicVisibility: "public",
		topicVideoStatus: "rendering",
		topicPostPublishedAt: "2026-11-01T00:00:00.000Z",
		discussionStatus: "recording",
	})

	// two reads of the film's status send its queries once
	await VISITOR_APP.request("/status/episodes/episode-1/topic-video")
	const filmQueryCount = sentQueries.length
	expect(filmQueryCount).toBeGreaterThan(0)
	await VISITOR_APP.request("/status/episodes/episode-1/topic-video")
	expect(sentQueries).toHaveLength(filmQueryCount)

	// two reads of the discussion's status send its queries once
	await VISITOR_APP.request("/status/topic-posts/post-1/discussion")
	const discussionQueryCount = sentQueries.length
	expect(discussionQueryCount).toBeGreaterThan(filmQueryCount)
	await VISITOR_APP.request("/status/topic-posts/post-1/discussion")
	expect(sentQueries).toHaveLength(discussionQueryCount)
})
