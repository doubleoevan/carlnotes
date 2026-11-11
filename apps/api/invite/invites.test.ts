// invite link tests: a topic's link shared from a Topic Post names only a published post of that topic, and a link
// shared from a post is reused apart from the topic's own
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import { invites } from "@carlnotes/db/schema/invites"
import { topics } from "@carlnotes/db/schema/topics"
import * as analytics from "@carlnotes/server/analytics"
import { toJsonRequest, toSignedInApp } from "../testSession"
import type { TopicPostRow } from "../topicPost/topicPosts"
import * as topicPosts from "../topicPost/topicPosts"
import { invitesRoute, toInviteTarget } from "./invites"

// the owner's invite topic, and the owner's live link shared from post-1
const TOPIC_ROW = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", name: "Coffee", visibility: "invite" })
const TOPIC_POST_INVITE_ROW = toTableRow(invites, {
	id: "invite-1",
	topicId: "topic-1",
	topicPostId: "post-1",
	token: "post-token",
	invitedByUserId: "owner-1",
	maxUses: 25,
	usedCount: 0,
})

// a post on a topic, published or still a draft
function toTopicPostRow(topicId: string, publishedAt: Date | null): TopicPostRow {
	return {
		topicPost: { id: "post-1", topicId, title: "Light Roasts", publishedAt },
		topic: { id: topicId, name: "Coffee" },
	} as TopicPostRow
}

// stand in for the topic, the owner's access row, and the owner's live link, and return each query sent
function stubInviteCreate(topicPostRow: TopicPostRow | null): SentQuery[] {
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(topicPostRow)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// the topic's row, the owner's live link for an invites read, and the owner's access row for every other read
	return stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [TOPIC_ROW]
		}
		return text.includes('from "invites"') ? [TOPIC_POST_INVITE_ROW] : [FREE_USER_ACCESS_ROW]
	})
}

// the owner's request for a link shared from post-1
function requestTopicPostInvite(): Response | Promise<Response> {
	return toSignedInApp(invitesRoute, "owner-1").request(
		"/topics/topic-1/invites",
		toJsonRequest({ source: "share-sheet", topicPostId: "post-1" }),
	)
}

afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test("a link shared from a published Topic Post of the topic is the post's own link", async () => {
	const sentQueries = stubInviteCreate(toTopicPostRow("topic-1", new Date("2026-11-01T10:00:00Z")))
	const response = await requestTopicPostInvite()

	// the post's live link is returned, found by the post's id beside the topic's
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ invite: { id: "invite-1", token: "post-token" } })
	const inviteQuery = sentQueries.find(({ text }) => text.includes('from "invites"'))
	expect(inviteQuery?.text).toContain('"topic_post_id" = ')
	expect(inviteQuery?.values).toContain("post-1")
})

test("a link shared from the topic itself leaves out every Topic Post's link", async () => {
	const sentQueries = stubInviteCreate(null)
	const response = await toSignedInApp(invitesRoute, "owner-1").request(
		"/topics/topic-1/invites",
		toJsonRequest({ source: "share-sheet" }),
	)

	// the topic's own link is the one with no post
	expect(response.status).toBe(200)
	const inviteQuery = sentQueries.find(({ text }) => text.includes('from "invites"'))
	expect(inviteQuery?.text).toContain('"topic_post_id" is null')
})

test("a link never names a Topic Post of another topic, a draft, or a post that is gone", async () => {
	const rejectedTopicPostRows = [
		toTopicPostRow("topic-2", new Date("2026-11-01T10:00:00Z")),
		toTopicPostRow("topic-1", null),
		null,
	]
	for (const rejectedTopicPostRow of rejectedTopicPostRows) {
		const sentQueries = stubInviteCreate(rejectedTopicPostRow)
		const response = await requestTopicPostInvite()

		// not found, before any invite is read or written
		expect(response.status).toBe(404)
		expect(sentQueries.some(({ text }) => text.includes('"invites"'))).toBe(false)
	}
})

test("a live token's target names the Topic Post its invite was shared from", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "invites"') ? [TOPIC_POST_INVITE_ROW] : [["invite"]]))
	expect(await toInviteTarget("post-token")).toEqual({ topicId: "topic-1", topicPostId: "post-1" })
})
