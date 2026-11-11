// a user's unseen Comment Mentions: the row the badges and the list read, the seen mark's event, and the two routes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import * as analytics from "@carlnotes/server/analytics"
import { toSignedInApp } from "../testSession"
import * as commentMentions from "./commentMentions"
import { saveSeenCommentMentions, toUnseenCommentMention } from "./commentMentions"
import { commentMentionsRoute } from "./commentMentionsRoute"

// a mention's row on a Topic's own thread
const TOPIC_MENTION_ROW = {
	commentId: "comment-1",
	body: "look at this @ava\nand a second line",
	createdAt: new Date("2026-11-09T12:00:00.000Z"),
	authorUserId: "user-ben",
	authorUsername: "ben",
	topicId: "topic-1",
	findingId: null,
	podcastEpisodeId: null,
	postId: null,
	targetTopicId: "topic-1",
	topicName: "Home espresso",
	podcastEpisodeTitle: null,
	season: null,
	episodeNumber: null,
	topicPostTitle: null,
}

// the properties a request sends with its events
const ANALYTICS_PROPERTIES = { entryPoint: "api", plan: "free" } as Parameters<
	typeof saveSeenCommentMentions
>[0]["analyticsProperties"]

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a mention on a Topic's thread names the Topic's page and opens its Comment there", () => {
	const unseenCommentMention = toUnseenCommentMention(TOPIC_MENTION_ROW)
	expect(unseenCommentMention).toEqual({
		commentId: "comment-1",
		author: { userId: "user-ben", username: "ben" },
		text: "look at this @ava",
		createdAt: "2026-11-09T12:00:00.000Z",
		topicId: "topic-1",
		target: { kind: "topic", id: "topic-1" },
		page: { kind: "topic", id: "topic-1", name: "Home espresso" },
		path: "/topics/topic-1/home-espresso?comment=comment-1",
	})
})

test("a mention on a Finding sits on its Topic's page, with the Finding and the Comment in the path", () => {
	const unseenCommentMention = toUnseenCommentMention({ ...TOPIC_MENTION_ROW, topicId: null, findingId: "finding-1" })
	expect(unseenCommentMention.target).toEqual({ kind: "finding", id: "finding-1" })
	expect(unseenCommentMention.page).toEqual({ kind: "topic", id: "topic-1", name: "Home espresso" })
	expect(unseenCommentMention.path).toContain("finding=finding-1")
	expect(unseenCommentMention.path).toEndWith("comment=comment-1")
})

test("a mention on a Podcast Episode or a Topic Post names that page", () => {
	// a published Podcast Episode's own page
	const podcastEpisodeMention = toUnseenCommentMention({
		...TOPIC_MENTION_ROW,
		topicId: null,
		podcastEpisodeId: "episode-1",
		podcastEpisodeTitle: "Burrs, measured",
		season: 2026,
		episodeNumber: 4,
	})
	expect(podcastEpisodeMention.page).toEqual({ kind: "podcastEpisode", id: "episode-1", name: "Burrs, measured" })
	expect(podcastEpisodeMention.path).toBe("/topics/topic-1/home-espresso/episodes/2026/4?comment=comment-1")

	// a Topic Post's own page
	const topicPostMention = toUnseenCommentMention({
		...TOPIC_MENTION_ROW,
		topicId: null,
		postId: "post-1",
		topicPostTitle: "Dialing in",
	})
	expect(topicPostMention.page).toEqual({ kind: "post", id: "post-1", name: "Dialing in" })
	expect(topicPostMention.path).toBe("/topics/topic-1/home-espresso/posts/post-1/dialing-in?comment=comment-1")
})

test("a Comment by Carl has no author", () => {
	const unseenCommentMention = toUnseenCommentMention({
		...TOPIC_MENTION_ROW,
		authorUserId: null,
		authorUsername: null,
	})
	expect(unseenCommentMention.author).toBeNull()
})

test("a seen mark clears the user's cached read and reports each Comment by its id and its Topic's id", async () => {
	// the update returns the two Comments it marked, and the read after it their Topics
	stubConnectionPool(({ text }) =>
		text.startsWith("update")
			? [["comment-1"], ["comment-2"]]
			: [
					["comment-1", "topic-1"],
					["comment-2", "topic-2"],
				],
	)
	const deleteRedisKeysSpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(0)
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// both are marked, and the user's cached read is cleared
	const seenCount = await saveSeenCommentMentions({
		userId: "user-ava",
		payload: { commentIds: ["comment-1", "comment-2"] },
		analyticsProperties: ANALYTICS_PROPERTIES,
	})
	expect(seenCount).toBe(2)
	expect(deleteRedisKeysSpy).toHaveBeenCalledWith("unseen-comment-mentions:user-ava")

	// one event for each, with ids and no username or text
	expect(trackEventSpy.mock.calls).toEqual([
		["social_mention_seen", "user-ava", { ...ANALYTICS_PROPERTIES, objectId: "comment-1", topicId: "topic-1" }],
		["social_mention_seen", "user-ava", { ...ANALYTICS_PROPERTIES, objectId: "comment-2", topicId: "topic-2" }],
	])
})

test("a seen mark that marks nothing clears no cache and reports no event", async () => {
	stubConnectionPool(() => [])
	const deleteRedisKeysSpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(0)
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const seenCount = await saveSeenCommentMentions({
		userId: "user-ava",
		payload: { isEveryMention: true },
		analyticsProperties: ANALYTICS_PROPERTIES,
	})
	expect(seenCount).toBe(0)
	expect(deleteRedisKeysSpy).not.toHaveBeenCalled()
	expect(trackEventSpy).not.toHaveBeenCalled()
})

test("both routes need a session", async () => {
	const loadSpy = spyOn(commentMentions, "loadUnseenCommentMentions").mockResolvedValue([])
	const saveSpy = spyOn(commentMentions, "saveSeenCommentMentions").mockResolvedValue(0)

	// a visitor has no mentions to read or to mark
	const readResponse = await commentMentionsRoute.request("/comment-mentions/unseen")
	const seenResponse = await commentMentionsRoute.request("/comment-mentions/seen", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ isEveryMention: true }),
	})
	expect(readResponse.status).toBe(401)
	expect(seenResponse.status).toBe(401)
	expect(loadSpy).not.toHaveBeenCalled()
	expect(saveSpy).not.toHaveBeenCalled()
})

test("a signed-in user reads their unseen mentions", async () => {
	const unseenCommentMentions: UnseenCommentMention[] = [toUnseenCommentMention(TOPIC_MENTION_ROW)]
	const loadSpy = spyOn(commentMentions, "loadUnseenCommentMentions").mockResolvedValue(unseenCommentMentions)
	const response = await toSignedInApp(commentMentionsRoute, "mention-user-1").request("/comment-mentions/unseen")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ commentMentions: unseenCommentMentions })
	expect(loadSpy).toHaveBeenCalledWith("mention-user-1")
})

test("a seen mark takes Comment ids or every mention, and nothing else", async () => {
	const saveSpy = spyOn(commentMentions, "saveSeenCommentMentions").mockResolvedValue(1)
	const sendSeen = (payload: unknown): Response | Promise<Response> =>
		toSignedInApp(commentMentionsRoute, "mention-user-2").request("/comment-mentions/seen", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		})

	// the Comments scrolled to, and Mark all seen
	expect((await sendSeen({ commentIds: ["comment-1"] })).status).toBe(200)
	expect((await sendSeen({ isEveryMention: true })).status).toBe(200)
	expect(saveSpy.mock.calls.map(([options]) => options.payload)).toEqual([
		{ commentIds: ["comment-1"] },
		{ isEveryMention: true },
	])
	expect(saveSpy.mock.calls[0]?.[0].userId).toBe("mention-user-2")

	// no ids, and a body that names neither
	expect((await sendSeen({ commentIds: [] })).status).toBe(400)
	expect((await sendSeen({})).status).toBe(400)
	expect(saveSpy).toHaveBeenCalledTimes(2)
})
