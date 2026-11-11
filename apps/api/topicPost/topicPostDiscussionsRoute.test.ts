// Topic Post Discussion route tests: the audio of a post its caller may read, who may regenerate and who is billed,
// the month's limit, a recording already on its way, a flagged note, and the event with ids and no note
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as quotas from "@carlnotes/db/quotas"
import * as discussionRecordings from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import * as analytics from "@carlnotes/server/analytics"
import * as authorization from "../authorization"
import * as moderation from "../moderation"
import { toPlayToken } from "../podcast/playTokens"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as topicPostDiscussions from "./topicPostDiscussions"
import { topicPostDiscussionsRoute } from "./topicPostDiscussionsRoute"
import type { TopicPostRow } from "./topicPosts"
import * as topicPosts from "./topicPosts"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a member's published post on a team's Topic
const TOPIC_POST_ROW = {
	topicPost: { id: "post-1", topicId: "topic-1", authorUserId: "member-1", publishedAt: new Date(), imageHash: null },
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "private",
		teamId: "team-1",
		name: "Home espresso",
		imageHash: null,
	},
	author: { userId: "member-1", username: "member-1", avatarSource: "generated", avatarKey: null },
} as TopicPostRow

// the note a regenerate sends
const HINT = "Spend a moment on the pancakes"

// the post's read, a caller who may publish, a clean note, regenerations left, and nothing recording
function stubDiscussionRoutes(): {
	isAllowedSpy: ReturnType<typeof spyOn>
	quotaSpy: ReturnType<typeof spyOn>
	discussionSpy: ReturnType<typeof spyOn>
	classifySpy: ReturnType<typeof spyOn>
	startSpy: ReturnType<typeof spyOn>
	trackEventSpy: ReturnType<typeof spyOn>
} {
	// the post's read, and each spy
	stubConnectionPool()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(TOPIC_POST_ROW)
	return {
		isAllowedSpy: spyOn(authorization, "isAllowed").mockResolvedValue(true),
		quotaSpy: spyOn(quotas, "loadDiscussionRegenerationQuota").mockResolvedValue({ used: 1, limit: 2, remaining: 1 }),
		discussionSpy: spyOn(topicPostDiscussions, "loadTopicPostDiscussion").mockResolvedValue(null),
		classifySpy: spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null),
		startSpy: spyOn(discussionRecordings, "startTopicPostDiscussion").mockResolvedValue("discussion-2"),
		trackEventSpy: spyOn(analytics, "trackEvent").mockImplementation(() => {}),
	}
}

// a regenerate as one signed-in user, who counts against a rate limit of their own
function regenerate(userId: string, body: { hint?: string } = { hint: HINT }): Promise<Response> {
	return Promise.resolve(
		toSignedInApp(topicPostDiscussionsRoute, userId).request(
			"/topic-posts/post-1/discussion/regenerate",
			toJsonRequest(body, "POST"),
		),
	)
}

test("a private Topic's audio is not found to a caller who may not read its post, and resolves for one who may", async () => {
	stubDiscussionRoutes()
	spyOn(topicPostDiscussions, "loadTopicPostDiscussionAudioRow").mockResolvedValue({
		id: "discussion-1",
		durationSeconds: 184,
		publishedAt: new Date("2026-11-04T09:00:00Z"),
		audioKey: "topic-post-discussions/post-1/discussion-1.mp3",
		audioByteSize: 2_400_000,
		script: null,
	})

	// a follower may not read a private Topic's post
	const canReadSpy = spyOn(topicPosts, "canReadTopicPost").mockResolvedValue(false)
	const followerApp = toSignedInApp(topicPostDiscussionsRoute, "follower-1")
	expect((await followerApp.request("/topic-posts/post-1/discussion/audio.mp3")).status).toBe(404)

	// a member's HEAD reads the recording's length, with no redirect to storage
	canReadSpy.mockResolvedValue(true)
	const memberApp = toSignedInApp(topicPostDiscussionsRoute, "member-2")
	const headResponse = await memberApp.request("/topic-posts/post-1/discussion/audio.mp3", { method: "HEAD" })
	expect(headResponse.status).toBe(200)
	expect(headResponse.headers.get("content-length")).toBe("2400000")
	expect(headResponse.headers.get("content-type")).toBe("audio/mpeg")
})

test("a play token reads the audio as its caller with no session, and another post's token reads as missing", async () => {
	stubDiscussionRoutes()
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	spyOn(topicPostDiscussions, "loadTopicPostDiscussionAudioRow").mockResolvedValue(undefined)
	const canReadSpy = spyOn(topicPosts, "canReadTopicPost").mockResolvedValue(true)

	// the post is read under the token's user, though the request brings no session
	const playToken = encodeURIComponent(toPlayToken({ topicPostId: "post-1", userId: "member-2" }))
	await topicPostDiscussionsRoute.request(`/topic-posts/post-1/discussion/audio.mp3?play=${playToken}`)
	expect(canReadSpy).toHaveBeenCalledWith("member-2", TOPIC_POST_ROW)

	// a token for another post responds 404 before the post is read
	const otherPostToken = encodeURIComponent(toPlayToken({ topicPostId: "post-2", userId: "member-2" }))
	const otherPostResponse = await topicPostDiscussionsRoute.request(
		`/topic-posts/post-1/discussion/audio.mp3?play=${otherPostToken}`,
	)
	expect(otherPostResponse.status).toBe(404)
	expect(canReadSpy).toHaveBeenCalledTimes(1)
})

test("a post with no recording, and a draft, have no audio", async () => {
	stubDiscussionRoutes()
	spyOn(topicPosts, "canReadTopicPost").mockResolvedValue(true)
	spyOn(topicPostDiscussions, "loadTopicPostDiscussionAudioRow").mockResolvedValue(undefined)
	const memberApp = toSignedInApp(topicPostDiscussionsRoute, "member-2")
	expect((await memberApp.request("/topic-posts/post-1/discussion/audio.mp3")).status).toBe(404)

	// a draft is not read at all
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue({
		...TOPIC_POST_ROW,
		topicPost: { ...TOPIC_POST_ROW.topicPost, publishedAt: null },
	})
	expect((await memberApp.request("/topic-posts/post-1/discussion/audio.mp3")).status).toBe(404)
})

test("a team member's regenerate bills the member, and reports its ids with no note", async () => {
	const { isAllowedSpy, startSpy, trackEventSpy } = stubDiscussionRoutes()
	const response = await regenerate("member-2")
	expect(response.status).toBe(202)
	expect(await response.json()).toEqual({ discussionId: "discussion-2" })

	// the member who asked is the one billed, by the right to publish on the post's Topic
	expect(isAllowedSpy).toHaveBeenCalledWith("member-2", "topicPost:publish", TOPIC_POST_ROW.topic)
	expect(startSpy).toHaveBeenCalledWith({ topicPostId: "post-1", userId: "member-2", kind: "regenerate", hint: HINT })

	// the event names the post and its Topic, and holds nothing of the note
	expect(trackEventSpy).toHaveBeenCalledTimes(1)
	const [eventName, eventUserId, eventProperties] = trackEventSpy.mock.calls[0] ?? []
	expect(eventName).toBe("social_topic_post_discussion_regenerate")
	expect(eventUserId).toBe("member-2")
	expect(eventProperties).toMatchObject({ objectId: "post-1", topicId: "topic-1", isOwner: false })
	expect(JSON.stringify(eventProperties)).not.toContain("pancakes")
})

test("a follower's regenerate reads as missing, and starts nothing", async () => {
	const { isAllowedSpy, startSpy } = stubDiscussionRoutes()
	isAllowedSpy.mockResolvedValue(false)
	expect((await regenerate("follower-1")).status).toBe(404)
	expect(startSpy).not.toHaveBeenCalled()
})

test("a regenerate at the month's limit, and one while a discussion records, start nothing", async () => {
	const { quotaSpy, discussionSpy, startSpy } = stubDiscussionRoutes()

	// the plan's regenerations are used
	quotaSpy.mockResolvedValue({ used: 2, limit: 2, remaining: 0 })
	expect((await regenerate("member-1")).status).toBe(429)

	// a recording is already on its way
	quotaSpy.mockResolvedValue({ used: 1, limit: 2, remaining: 1 })
	discussionSpy.mockResolvedValue({
		id: "discussion-1",
		durationSeconds: 184,
		publishedAt: "2026-11-04T09:00:00.000Z",
		isRecording: true,
	})
	expect((await regenerate("member-1")).status).toBe(409)
	expect(startSpy).not.toHaveBeenCalled()
})

test("a regenerate that loses the race for a post's one recording row is a conflict, and reports nothing", async () => {
	// the insert of a second recording row for the post is a duplicate key
	const { startSpy, trackEventSpy } = stubDiscussionRoutes()
	startSpy.mockRejectedValue(
		new Error("Failed query", { cause: Object.assign(new Error("duplicate"), { code: "23505" }) }),
	)
	const response = await regenerate("member-1")
	expect(response.status).toBe(409)
	expect(await response.json()).toEqual({ error: "Carl and Vienna are already recording this one." })
	expect(trackEventSpy).not.toHaveBeenCalled()
})

test("a flagged note is refused before any recording starts, and a regenerate with no note skips the check", async () => {
	const { classifySpy, startSpy, trackEventSpy } = stubDiscussionRoutes()
	classifySpy.mockResolvedValue("harassment")
	const flaggedResponse = await regenerate("member-1")
	expect(flaggedResponse.status).toBe(422)
	expect(startSpy).not.toHaveBeenCalled()
	expect(trackEventSpy).not.toHaveBeenCalled()

	// no note, so nothing to classify
	classifySpy.mockClear()
	expect((await regenerate("member-1", {})).status).toBe(202)
	expect(classifySpy).not.toHaveBeenCalled()
	expect(startSpy).toHaveBeenCalledWith({
		topicPostId: "post-1",
		userId: "member-1",
		kind: "regenerate",
		hint: undefined,
	})
})
