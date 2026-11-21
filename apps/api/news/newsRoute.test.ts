// the news routes: a session for the user's own news, the window and the cursor, a profile's news for anyone, the
// visitor audience, a visitor's cached first page, a person's own cached first page and its clear, and the read limit
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { NewsResponse } from "@carlnotes/contracts/news"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import { toSignedInApp } from "../testSession"
import { clearOwnNews } from "./newsCaches"
import { newsRoute } from "./newsRoute"
import * as news from "./readNews"

// the page every read here returns
const NEWS_RESULT: NewsResponse = { newsEvents: [], podcastEpisodes: [], total: 45, cursor: "window" }

// each test reads through its own empty Redis
beforeEach(() => {
	stubRedisClient()
})

// put the connection pool, Redis, and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

test("a user's own news needs a session", async () => {
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const response = await newsRoute.request("/news")
	expect(response.status).toBe(401)
	expect(readSpy).not.toHaveBeenCalled()
})

test("a read that names no window reads the user's week", async () => {
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const response = await toSignedInApp(newsRoute, "news-user-1").request("/news")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual(NEWS_RESULT)
	expect(readSpy.mock.calls[0]?.[0]).toEqual({
		profileUserId: "news-user-1",
		userId: "news-user-1",
		window: "week",
		page: 1,
	})
})

test("a read passes its window, its page, and its cursor on", async () => {
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	await toSignedInApp(newsRoute, "news-user-2").request("/news?window=hour&page=3&cursor=abc")
	expect(readSpy.mock.calls[0]?.[0]).toMatchObject({ window: "hour", page: 3, cursor: "abc" })
})

test("a window the picker does not offer is invalid input", async () => {
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const response = await toSignedInApp(newsRoute, "news-user-3").request("/news?window=month")
	expect(response.status).toBe(400)
	expect(readSpy).not.toHaveBeenCalled()
})

test("a cursor the window did not return is invalid input", async () => {
	spyOn(news, "readNews").mockResolvedValue(null)
	const response = await toSignedInApp(newsRoute, "news-user-4").request("/news?cursor=abc")
	expect(response.status).toBe(400)
})

test("a visitor reads a profile's news as a visitor", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const response = await newsRoute.request("/profiles/profile-user-1/news?window=day")
	expect(response.status).toBe(200)
	expect(readSpy.mock.calls[0]?.[0]).toEqual({
		profileUserId: "profile-user-1",
		userId: null,
		window: "day",
		page: 1,
	})
})

test("a session reads another person's news under its own id", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	await toSignedInApp(newsRoute, "news-user-5").request("/profiles/profile-user-1/news")
	expect(readSpy.mock.calls[0]?.[0]).toMatchObject({ profileUserId: "profile-user-1", userId: "news-user-5" })
})

test("a session in the visitor audience reads a profile's news as a visitor, from the visitor's cache", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const cacheSpy = spyOn(redis, "cacheJson")
	await toSignedInApp(newsRoute, "news-admin-1").request("/profiles/profile-user-1/news?audience=visitor")
	expect(readSpy.mock.calls[0]?.[0]).toEqual({ profileUserId: "profile-user-1", userId: null, window: "week", page: 1 })
	expect(cacheSpy.mock.calls[0]?.[0].key).toBe("visitor-news:profile-user-1:week")
})

test("a audience the select does not offer is invalid input", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const response = await newsRoute.request("/profiles/profile-user-1/news?audience=owner")
	expect(response.status).toBe(400)
	expect(readSpy).not.toHaveBeenCalled()
})

test("a visitor's first page is cached by the profile and the window for a minute", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const cacheSpy = spyOn(redis, "cacheJson")
	await newsRoute.request("/profiles/profile-user-1/news?window=day")
	expect(cacheSpy.mock.calls[0]?.[0]).toMatchObject({ key: "visitor-news:profile-user-1:day", ttlMs: 60_000 })

	// another window is another key
	await newsRoute.request("/profiles/profile-user-1/news")
	expect(cacheSpy.mock.calls[1]?.[0].key).toBe("visitor-news:profile-user-1:week")
})

test("a cached first page returns to the next visitor with no read of the news", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	await newsRoute.request("/profiles/profile-user-1/news")
	const response = await newsRoute.request("/profiles/profile-user-1/news")
	expect(await response.json()).toEqual(NEWS_RESULT)
	expect(readSpy).toHaveBeenCalledTimes(1)
})

test("another user's read, a later page, and a read with a cursor are never cached", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const cacheSpy = spyOn(redis, "cacheJson")

	// another user's read of the profile, and the person's own later page and read with a cursor
	await toSignedInApp(newsRoute, "news-user-7").request("/profiles/profile-user-1/news")
	await toSignedInApp(newsRoute, "profile-user-1").request("/news?page=2")
	await toSignedInApp(newsRoute, "profile-user-1").request("/news?cursor=abc")

	// a visitor's later page, and a visitor's read with a cursor
	await newsRoute.request("/profiles/profile-user-1/news?page=2")
	await newsRoute.request("/profiles/profile-user-1/news?cursor=abc")
	expect(readSpy).toHaveBeenCalledTimes(5)
	expect(cacheSpy).not.toHaveBeenCalled()
})

test("a person's own first page is cached by the person and the window for a minute, on both routes", async () => {
	stubConnectionPool(() => [["profile-user-1"]])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const cacheSpy = spyOn(redis, "cacheJson")
	const app = toSignedInApp(newsRoute, "profile-user-1")
	await app.request("/news?window=day")
	expect(cacheSpy.mock.calls[0]?.[0]).toMatchObject({ key: "own-news:profile-user-1:day", ttlMs: 60_000 })

	// the person's read of their own profile shares the copy, so the second read reads no news row
	await app.request("/profiles/profile-user-1/news?window=day")
	expect(cacheSpy.mock.calls[1]?.[0].key).toBe("own-news:profile-user-1:day")
	expect(readSpy).toHaveBeenCalledTimes(1)
})

test("a person's own comment shows on their next read, and another reader never reads their copy", async () => {
	// the person's first page before and after their comment, from a read that sees the comment once it is posted
	stubConnectionPool(() => [["profile-user-1"]])
	const commentNews: NewsResponse = { ...NEWS_RESULT, total: 46 }
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const personApp = toSignedInApp(newsRoute, "profile-user-1")
	await personApp.request("/news")

	// the comment's write clears the person's copy, so the next read reads the comment
	readSpy.mockResolvedValue(commentNews)
	await clearOwnNews("profile-user-1")
	expect(await (await personApp.request("/news")).json()).toEqual(commentNews)

	// another reader of the person's profile reads for themselves, never from the person's copy
	readSpy.mockResolvedValue(NEWS_RESULT)
	const strangerResponse = await toSignedInApp(newsRoute, "news-user-8").request("/profiles/profile-user-1/news")
	expect(await strangerResponse.json()).toEqual(NEWS_RESULT)
	expect(readSpy.mock.calls.at(-1)?.[0]).toMatchObject({ profileUserId: "profile-user-1", userId: "news-user-8" })
})

test("a profile nobody has reads as missing", async () => {
	stubConnectionPool(() => [])
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)
	const response = await newsRoute.request("/profiles/nobody/news")
	expect(response.status).toBe(404)
	expect(readSpy).not.toHaveBeenCalled()
})

test("the 121st read inside a minute is rejected as rate limited", async () => {
	// the counter returns each read's place in the minute
	let hitCount = 119
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockImplementation(async () => {
		hitCount += 1
		return { count: hitCount, resetAt: Date.now() + 60_000 }
	})
	const readSpy = spyOn(news, "readNews").mockResolvedValue(NEWS_RESULT)

	// the 120th read passes and the 121st is rejected before it reads
	const app = toSignedInApp(newsRoute, "news-user-6")
	expect((await app.request("/news")).status).toBe(200)
	const rejectedResponse = await app.request("/news")
	expect(rejectedResponse.status).toBe(429)
	expect(readSpy).toHaveBeenCalledTimes(1)
})
