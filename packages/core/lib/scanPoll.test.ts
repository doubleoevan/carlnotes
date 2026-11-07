// a poll reload keeps what the page shows and the poll leaves out
import { expect, test } from "bun:test"
import type { TopicPageResult } from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toPolledTopicPage, toPolledTopicPageResult } from "./scanPoll"

// the fields a full read of a page holds and a poll leaves out
const SHOWN_FIELDS = {
	relatedTopics: [{ id: "related-1", name: "Robot vacuums", latestPodcastEpisode: null }],
	reactions: { counts: [], ownReactionType: "like" },
	commentThread: { comments: [], nextCursor: "next-page", weekCommentCount: 2, sharedCommentSlots: null },
}

// a topic page with the given id and the fields a full read holds
function toFullTopicPage(id: string): TopicResponse {
	return { id, name: "Full read", ...SHOWN_FIELDS } as unknown as TopicResponse
}

// a poll's topic page with the given id, which has no related topics, reactions, or comment thread
function toPolledTopic(id: string): TopicResponse {
	return { id, name: "Poll", relatedTopics: [] } as unknown as TopicResponse
}

test("a poll reload of the same topic takes the poll's fields and keeps what the poll leaves out", () => {
	const polledTopicPage = toPolledTopicPage(toFullTopicPage("topic-1"), toPolledTopic("topic-1"))
	expect(polledTopicPage).toMatchObject({ name: "Poll", ...SHOWN_FIELDS })
})

test("a poll reload keeps the page's comment thread and reactions as the same objects", () => {
	const fullTopicPage = toFullTopicPage("topic-1")
	const polledTopicPage = toPolledTopicPage(fullTopicPage, toPolledTopic("topic-1"))
	expect(polledTopicPage?.commentThread).toBe(fullTopicPage.commentThread)
	expect(polledTopicPage?.reactions).toBe(fullTopicPage.reactions)
})

test("a poll reload of another topic, or of a topic gone missing, keeps the reload's own", () => {
	expect(toPolledTopicPage(toFullTopicPage("topic-1"), toPolledTopic("topic-2"))?.commentThread).toBeUndefined()
	expect(toPolledTopicPage(undefined, toFullTopicPage("topic-2"))?.relatedTopics).toHaveLength(1)
	expect(toPolledTopicPage(toFullTopicPage("topic-1"), null)).toBeNull()
})

test("a polled page result keeps what the visible page shows, and a gated or missing result stays", () => {
	const visiblePage: TopicPageResult = { status: "visible", topic: toFullTopicPage("topic-1") }
	const polledPage: TopicPageResult = { status: "visible", topic: toPolledTopic("topic-1") }
	expect(toPolledTopicPageResult(visiblePage, polledPage)).toMatchObject({
		status: "visible",
		topic: { name: "Poll", ...SHOWN_FIELDS },
	})
	expect(toPolledTopicPageResult(undefined, polledPage)).toEqual(polledPage)
	expect(toPolledTopicPageResult(visiblePage, { status: "missing" })).toEqual({ status: "missing" })
})
