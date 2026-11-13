// the Topic Post MCP views' data: a post's discussion plays with a play token for its caller, and offers no Regenerate
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { EMPTY_COMMENT_THREAD } from "@carlnotes/contracts/social"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { appUrl } from "@carlnotes/server/appUrl"
import { readPlayToken } from "../podcast/playTokens"
import type { TopicPostRow } from "../topicPost/topicPosts"
import * as topicPosts from "../topicPost/topicPosts"
import * as mcpViewData from "./mcpViewData"
import * as socialTools from "./socialTools"
import { USER } from "./toolTestFixtures"
import { loadTopicPostMcpViewData } from "./topicPostMcpViewData"

// the auth secret the play token signs with
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// a published post as an editor of its Topic reads it, with a recording and a regeneration quota, and its row
const TOPIC_POST = {
	id: "post-1",
	topicId: "topic-1",
	topicName: "Espresso",
	title: "Light Roasts",
	summary: null,
	publishedAt: "2026-11-03T16:00:00.000Z",
	path: "/topics/topic-1/espresso/posts/post-1/light-roasts",
	image: { list: { url: "/api/topic-post-images/post-1/hash/list.jpg" }, thumbnail: { url: "/thumbnail.jpg" } },
	isTopicPublic: true,
	discussion: { id: "discussion-1", durationSeconds: 184, isRecording: false },
	discussionRegenerationQuota: { used: 1, limit: 10 },
} as unknown as TopicPostResponse
const TOPIC_POST_ROW = {
	topicPost: { id: TOPIC_POST.id, topicId: TOPIC_POST.topicId, publishedAt: new Date(), html: "<p>Light</p>" },
	topic: { id: TOPIC_POST.topicId, name: TOPIC_POST.topicName, visibility: "public" },
} as TopicPostRow

test("a post's MCP view data plays its discussion with the caller's play token, and holds no regeneration quota", async () => {
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	spyOn(topicPosts, "toTopicPostResponse").mockResolvedValue(TOPIC_POST)
	const commentPageSpy = spyOn(socialTools, "loadToolCommentPage").mockResolvedValue(EMPTY_COMMENT_THREAD)
	const { topicPost, podcastEpisodes } = await loadTopicPostMcpViewData(USER, TOPIC_POST_ROW)

	// the post with its thread as a tool reads it, and no Regenerate
	expect(TOPIC_POST.discussionRegenerationQuota).not.toBeNull()
	expect(topicPost?.discussionRegenerationQuota).toBeNull()
	expect(topicPost?.commentThread).toEqual(EMPTY_COMMENT_THREAD)
	expect(commentPageSpy).toHaveBeenCalledWith({
		userId: "user-1",
		topic: TOPIC_POST_ROW.topic,
		target: { kind: "post", id: TOPIC_POST.id },
	})

	// the discussion's audio url is the audio route's, with a token that names this post and this caller
	const audioUrl = new URL(podcastEpisodes[0]?.audioUrl ?? "")
	expect(audioUrl.pathname).toBe(`/api/topic-posts/${TOPIC_POST.id}/discussion/audio.mp3`)
	const playToken = audioUrl.searchParams.get("play") ?? ""
	expect(readPlayToken({ playToken, topicPostId: TOPIC_POST.id })).toEqual({ userId: "user-1" })

	// the covers are absolute, for a frame with no origin of its own
	expect(new URL(podcastEpisodes[0]?.coverUrl ?? "").pathname).toBe("/api/topic-post-images/post-1/hash/list.jpg")
	expect(new URL(podcastEpisodes[0]?.smallCoverUrl ?? "").pathname).toBe("/thumbnail.jpg")
})

test("a post with no recording has no podcast episode to play", async () => {
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	spyOn(topicPosts, "toTopicPostResponse").mockResolvedValue({ ...TOPIC_POST, discussion: null })
	spyOn(socialTools, "loadToolCommentPage").mockResolvedValue(EMPTY_COMMENT_THREAD)
	expect((await loadTopicPostMcpViewData(USER, TOPIC_POST_ROW)).podcastEpisodes).toEqual([])
})

test("the post's body images load from the site's absolute url, which the view asks the post's page for", async () => {
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	const responseSpy = spyOn(topicPosts, "toTopicPostResponse").mockResolvedValue(TOPIC_POST)
	spyOn(socialTools, "loadToolCommentPage").mockResolvedValue(EMPTY_COMMENT_THREAD)
	await loadTopicPostMcpViewData(USER, TOPIC_POST_ROW)
	expect(responseSpy).toHaveBeenCalledWith("user-1", TOPIC_POST_ROW, { siteUrl: appUrl() })
})
