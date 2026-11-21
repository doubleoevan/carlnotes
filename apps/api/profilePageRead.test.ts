// profile page read tests: a failed news read still returns the profile and is never stored, a visitor's read fills
// the copy, the person's read and an admin's visitor audience are built for the reader and fill nothing, and anyone
// else shares the copy with their own news and part
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { NewsResponse } from "@carlnotes/contracts/news"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { toVisitorProfilePageKey } from "@carlnotes/db/visitorPageCaches"
import * as monitoring from "@carlnotes/server/monitoring"
import * as newsCaches from "./news/newsCaches"
import { toTestPageHead } from "./pageReadTestFixtures"
import { profilePageReadRoute, readProfilePageRead } from "./profilePageRead"
import * as profileReader from "./profileReader"
import * as profiles from "./profiles"
import * as pageHead from "./share/pageHead"
import { toSignedInApp } from "./testSession"
import * as topicsUserStates from "./topic/topicsUserState"
import * as userBlocks from "./userBlocks"

// the profile the loader returns, and an empty first news page
const PROFILE = { userId: "person-1", username: "carl" } as ProfileResponse
const NEWS = { newsEvents: [], hasMore: false } as unknown as NewsResponse

// the fake Redis map each test starts with, and the profile loader's spy
let storedValueByKey: Map<string, string>
let loadProfileSpy: ReturnType<typeof spyOn>

// a fresh Redis and the head and profile loaders stubbed before each test, and everything back after
beforeEach(() => {
	storedValueByKey = stubRedisClient()
	spyOn(pageHead, "loadProfilePageHeadFromProfile").mockResolvedValue(toTestPageHead("carl"))
	loadProfileSpy = spyOn(profiles, "loadProfile").mockResolvedValue(PROFILE)
	spyOn(console, "error").mockImplementation(() => {})
})

// the Redis client and every spy back after each test
afterEach(() => {
	restoreRedisClient()
	mock.restore()
})

test("a failed news read still returns the profile, with no news, and leaves no copy", async () => {
	// the news read fails, and its failure is reported
	spyOn(newsCaches, "readCachedNews").mockRejectedValue(new Error("news is down"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// the profile and its head return without news, and nothing is stored
	const profilePageRead = await readProfilePageRead({
		profileUserId: "person-1",
		sessionUserId: null,
		audienceUserId: null,
	})
	expect(profilePageRead).toEqual({ head: toTestPageHead("carl"), profile: PROFILE, news: null, userState: null })
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(storedValueByKey.has(toVisitorProfilePageKey("person-1"))).toBe(false)
})

test("a visitor's read fills the copy, and the next visitor's read loads nothing", async () => {
	spyOn(newsCaches, "readCachedNews").mockResolvedValue(NEWS)
	const visitorOptions = { profileUserId: "person-1", sessionUserId: null, audienceUserId: null }
	expect((await readProfilePageRead(visitorOptions))?.news).toEqual(NEWS)
	expect(storedValueByKey.has(toVisitorProfilePageKey("person-1"))).toBe(true)
	await readProfilePageRead(visitorOptions)
	expect(loadProfileSpy).toHaveBeenCalledTimes(1)
})

test("an admin reading as the visitor audience is built for that audience and fills no copy", async () => {
	spyOn(newsCaches, "readCachedNews").mockResolvedValue(NEWS)
	await readProfilePageRead({ profileUserId: "person-1", sessionUserId: "admin-1", audienceUserId: null })
	expect(loadProfileSpy.mock.calls[0]?.[1]).toBeNull()
	expect(storedValueByKey.has(toVisitorProfilePageKey("person-1"))).toBe(false)
})

test("the person's own read is built as them and fills no copy", async () => {
	spyOn(newsCaches, "readCachedNews").mockResolvedValue(NEWS)
	spyOn(profileReader, "loadProfileReader").mockResolvedValue("person")
	const profilePageRead = await readProfilePageRead({
		profileUserId: "person-1",
		sessionUserId: "person-1",
		audienceUserId: "person-1",
	})
	expect(loadProfileSpy.mock.calls[0]?.[1]).toBe("person-1")
	expect(profilePageRead?.userState).toBeNull()
	expect(storedValueByKey.has(toVisitorProfilePageKey("person-1"))).toBe(false)
})

test("a signed-in reader of someone else's profile shares the copy with their own news and part", async () => {
	// the reader reads as a visitor would, blocked the person, and follows one topic
	const readCachedNewsSpy = spyOn(newsCaches, "readCachedNews").mockResolvedValue(NEWS)
	spyOn(profileReader, "loadProfileReader").mockResolvedValue("visitor")
	spyOn(userBlocks, "loadUserBlocksBetween").mockResolvedValue({
		blockedUserIds: new Set(["person-1"]),
		userBlockUserIds: new Set(["person-1"]),
	})
	const topicsUserState = {
		teamByTopicId: {},
		isEmailEnabledByTopicId: { "topic-1": true },
		reactionCountByTopicId: {},
	}
	const loadTopicsUserStateSpy = spyOn(topicsUserStates, "loadTopicsUserState").mockResolvedValue(topicsUserState)
	const readerOptions = { profileUserId: "person-1", sessionUserId: "reader-1", audienceUserId: "reader-1" }

	// the read fills the visitors' copy, built for no one, and lays the reader's part beside it
	const profilePageRead = await readProfilePageRead(readerOptions)
	expect(loadProfileSpy.mock.calls[0]?.[1]).toBeNull()
	expect(storedValueByKey.has(toVisitorProfilePageKey("person-1"))).toBe(true)
	expect(profilePageRead?.userState).toEqual({ ...topicsUserState, isBlocked: true })
	expect(loadTopicsUserStateSpy.mock.calls[0]?.[0]).toMatchObject({ userId: "reader-1", isInUserBlock: true })

	// the next reader's read loads the profile no more, and the news is each reader's own
	await readProfilePageRead(readerOptions)
	expect(loadProfileSpy).toHaveBeenCalledTimes(1)
	expect(readCachedNewsSpy.mock.calls.map(([newsRead]) => newsRead.userId)).toEqual([null, "reader-1", "reader-1"])
})

// a profile with eight Topic Posts: one full page of six and a second page of two
const PROFILE_TOPIC_POST_IDS = ["post-1", "post-2", "post-3", "post-4", "post-5", "post-6", "post-7", "post-8"]
const PROFILE_WITH_TOPIC_POSTS = {
	...PROFILE,
	profileTopicPosts: PROFILE_TOPIC_POST_IDS.map((id) => ({ id })),
} as ProfileResponse

// the profile a route read returns, with the ids of its Topic Posts
async function readProfileRoute(path: string, userId?: string): Promise<ProfileResponse> {
	const app = userId ? toSignedInApp(profilePageReadRoute, userId) : profilePageReadRoute
	const response = await app.request(path)
	expect(response.status).toBe(200)
	const payload = (await response.json()) as { profile?: ProfileResponse } & ProfileResponse
	return payload.profile ?? payload
}

test("a profile read that asks for no pages holds every Topic Post, and a paged read holds the page it names", async () => {
	spyOn(newsCaches, "readCachedNews").mockResolvedValue(NEWS)
	loadProfileSpy.mockResolvedValue(PROFILE_WITH_TOPIC_POSTS)

	// the whole list, as a released app reads it
	const wholeProfile = await readProfileRoute("/profiles/person-1/page")
	expect(wholeProfile.profileTopicPosts.map(({ id }) => id)).toEqual(PROFILE_TOPIC_POST_IDS)
	expect(wholeProfile.profileTopicPostsPage).toBeUndefined()

	// the second page, with where it sits, cut from the copy the first read filled
	const pagedProfile = await readProfileRoute("/profiles/person-1/page?paged=1&topicPostsPage=1")
	expect(pagedProfile.profileTopicPosts.map(({ id }) => id)).toEqual(["post-7", "post-8"])
	expect(pagedProfile.profileTopicPostsPage).toEqual({ page: 1, totalCount: 8 })
	expect(loadProfileSpy).toHaveBeenCalledTimes(1)
})

test("the person's own paged read holds every Topic Post, because their rank dialog ranks them all", async () => {
	spyOn(newsCaches, "readCachedNews").mockResolvedValue(NEWS)
	spyOn(profileReader, "loadProfileReader").mockResolvedValue("person")
	loadProfileSpy.mockResolvedValue(PROFILE_WITH_TOPIC_POSTS)
	const ownProfile = await readProfileRoute("/profiles/person-1/page?paged=1", "person-1")
	expect(ownProfile.profileTopicPosts).toHaveLength(8)
	expect(ownProfile.profileTopicPostsPage).toBeUndefined()
})

test("a visitor's later page of a profile's Topic Posts is cut from the profile's copy", async () => {
	spyOn(newsCaches, "readCachedNews").mockResolvedValue(NEWS)
	loadProfileSpy.mockResolvedValue(PROFILE_WITH_TOPIC_POSTS)
	const response = await profilePageReadRoute.request("/profiles/person-1/topic-posts?page=1")
	expect(await response.json()).toEqual({ topicPosts: [{ id: "post-7" }, { id: "post-8" }], totalCount: 8 })

	// a second page reads the copy the first filled
	await profilePageReadRoute.request("/profiles/person-1/topic-posts?page=0")
	expect(loadProfileSpy).toHaveBeenCalledTimes(1)
})
