// the Comment Mention store's rules: one list every badge counts from, read on a page load alone, and a seen mark
// that empties the badges at once
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as commentMentionClient from "@carlnotes/client/commentMentionClient"
import type { UnseenCommentMention } from "@carlnotes/contracts/commentMentions"
import {
	loadCommentMentions,
	markCommentMentionsSeen,
	markEveryCommentMentionSeen,
	setCommentMentions,
	toPageCommentMentions,
	toThreadCommentMentions,
} from "./commentMentionStore"

// a mention on a Topic's own thread, one on a Finding of that Topic, and one on a Podcast Episode
const TOPIC_MENTION: UnseenCommentMention = {
	commentId: "comment-topic",
	author: { userId: "user-ben", username: "ben" },
	text: "look at this @ava",
	createdAt: "2026-11-09T12:00:00.000Z",
	topicId: "topic-1",
	target: { kind: "topic", id: "topic-1" },
	page: { kind: "topic", id: "topic-1", name: "Home espresso" },
	path: "/topics/topic-1/home-espresso?comment=comment-topic",
}
const FINDING_MENTION: UnseenCommentMention = {
	...TOPIC_MENTION,
	commentId: "comment-finding",
	target: { kind: "finding", id: "finding-1" },
	path: "/topics/topic-1/home-espresso?finding=finding-1&comment=comment-finding",
}
const PODCAST_EPISODE_MENTION: UnseenCommentMention = {
	...TOPIC_MENTION,
	commentId: "comment-episode",
	target: { kind: "podcastEpisode", id: "episode-1" },
	page: { kind: "podcastEpisode", id: "episode-1", name: "Burrs, measured" },
	path: "/topics/topic-1/home-espresso/episodes/2026/4?comment=comment-episode",
}
const COMMENT_MENTIONS = [TOPIC_MENTION, FINDING_MENTION, PODCAST_EPISODE_MENTION]

// empty the store and put the spies back after each test
afterEach(() => {
	setCommentMentions([])
	mock.restore()
})

test("a section counts its own thread, and a Topic's page counts its thread and its Findings'", () => {
	expect(toThreadCommentMentions(COMMENT_MENTIONS, { kind: "finding", id: "finding-1" })).toEqual([FINDING_MENTION])
	expect(toPageCommentMentions(COMMENT_MENTIONS, { kind: "topic", id: "topic-1" })).toEqual([
		TOPIC_MENTION,
		FINDING_MENTION,
	])
	expect(toPageCommentMentions(COMMENT_MENTIONS, { kind: "podcastEpisode", id: "episode-1" })).toEqual([
		PODCAST_EPISODE_MENTION,
	])
})

test("the list is read once on each page load and never in between", async () => {
	const fetchSpy = spyOn(commentMentionClient, "fetchUnseenCommentMentions").mockResolvedValue(COMMENT_MENTIONS)

	// two page loads read twice, and nothing reads while a page stays open
	await loadCommentMentions()
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(fetchSpy).toHaveBeenCalledTimes(1)
	await loadCommentMentions()
	expect(fetchSpy).toHaveBeenCalledTimes(2)
})

test("a failed read keeps the last list", async () => {
	setCommentMentions(COMMENT_MENTIONS)
	spyOn(commentMentionClient, "fetchUnseenCommentMentions").mockRejectedValue(new Error("offline"))
	const seenSpy = spyOn(commentMentionClient, "sendCommentMentionsSeen").mockResolvedValue()
	await loadCommentMentions()

	// the three mentions are still there to mark
	await markCommentMentionsSeen(COMMENT_MENTIONS.map((commentMention) => commentMention.commentId))
	expect(seenSpy).toHaveBeenCalledWith({
		commentIds: ["comment-topic", "comment-finding", "comment-episode"],
	})
})

test("a seen mark sends only the Comments the list holds, and none for a Comment with no mention", async () => {
	setCommentMentions(COMMENT_MENTIONS)
	const seenSpy = spyOn(commentMentionClient, "sendCommentMentionsSeen").mockResolvedValue()

	// a Comment with no mention sends nothing, and a mentioned one is sent once
	await markCommentMentionsSeen(["comment-other"])
	expect(seenSpy).not.toHaveBeenCalled()
	await markCommentMentionsSeen(["comment-finding", "comment-other"])
	expect(seenSpy).toHaveBeenCalledWith({ commentIds: ["comment-finding"] })

	// the marked mention left the list, so a second mark of it sends nothing
	await markCommentMentionsSeen(["comment-finding"])
	expect(seenSpy).toHaveBeenCalledTimes(1)
})

test("Mark all seen empties the list at once, and a rejected mark reads it again", async () => {
	setCommentMentions(COMMENT_MENTIONS)
	const seenSpy = spyOn(commentMentionClient, "sendCommentMentionsSeen").mockRejectedValue(new Error("offline"))
	const fetchSpy = spyOn(commentMentionClient, "fetchUnseenCommentMentions").mockResolvedValue(COMMENT_MENTIONS)
	await markEveryCommentMentionSeen()
	expect(seenSpy).toHaveBeenCalledWith({ isEveryMention: true })
	expect(fetchSpy).toHaveBeenCalledTimes(1)

	// an empty list has nothing to mark
	setCommentMentions([])
	await markEveryCommentMentionSeen()
	expect(seenSpy).toHaveBeenCalledTimes(1)
})
