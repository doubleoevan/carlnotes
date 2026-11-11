// Topic Post image report tests: a reporter no longer sees the image they reported until it changes, and the report
// names the post's title and page
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { toReportedSubject } from "../report/reportSubjects"
import type { TopicPostRow } from "./topicPosts"
import * as topicPosts from "./topicPosts"
import { toTopicPostResponse } from "./topicPosts"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// when the post's image last changed
const IMAGE_UPDATED_AT = new Date("2026-11-10T09:00:00Z")

// a member's published post on a public Topic, with an image at one hash
const TOPIC_POST_ROW = {
	topicPost: {
		id: "post-1",
		topicId: "topic-1",
		authorUserId: "member-1",
		title: "Dialing in",
		html: "<p>Start light.</p>",
		wordCount: 320,
		version: 3,
		publishedAt: new Date("2026-11-09T12:00:00Z"),
		editedAt: null,
		summary: null,
		imageHash: "0123456789abcdef0123456789abcdef",
		imageOrigin: "generated",
		imagePrompt: null,
		imageUpdatedAt: IMAGE_UPDATED_AT,
	},
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: null,
		name: "Home espresso",
		imageHash: null,
	},
	author: { userId: "member-1", username: "member-1", avatarSource: "generated", avatarKey: null },
} as TopicPostRow

test("a reader who reported the image no longer sees it, and any other reader does", async () => {
	// reader-1 has an open report of the post's image, and reader-2 has none
	const sentQueries = stubConnectionPool(({ text, values }) =>
		text.includes('from "reports"') && values.includes("reader-1") ? [["report-1"]] : [],
	)
	expect((await toTopicPostResponse("reader-1", TOPIC_POST_ROW)).image).toBeNull()
	expect((await toTopicPostResponse("reader-2", TOPIC_POST_ROW)).image).not.toBeNull()

	// the report counts only if it came after the image last changed, so a new hash shows the image again
	const reportQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "reports"'))
	expect(reportQuery?.text).toContain('"reports"."created_at" >')
	expect(reportQuery?.values).toEqual(
		expect.arrayContaining(["reader-1", "topicPostImage", "post-1", IMAGE_UPDATED_AT.toISOString()]),
	)
})

test("a visitor, and a post with no image, read no report", async () => {
	const sentQueries = stubConnectionPool()
	await toTopicPostResponse(null, TOPIC_POST_ROW)
	const noImageRow = { ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, imageHash: null } }
	expect((await toTopicPostResponse("reader-1", noImageRow)).image).toBeNull()
	expect(sentQueries.some((sentQuery) => sentQuery.text.includes('from "reports"'))).toBe(false)
})

test("a report of a post's image names the post's title, its page, and its author", async () => {
	stubConnectionPool()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(TOPIC_POST_ROW)
	expect(await toReportedSubject("reader-1", { subjectKind: "topicPostImage", subjectId: "post-1" })).toEqual({
		kind: "topicPostImage",
		id: "post-1",
		label: "Dialing in",
		path: "/topics/topic-1/home-espresso/posts/post-1/dialing-in",
		text: "Dialing in",
		authorUserId: "member-1",
	})

	// a draft, and a post with no image, have no image to report
	const draftRow = { ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, publishedAt: null } }
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(draftRow)
	expect(await toReportedSubject("reader-1", { subjectKind: "topicPostImage", subjectId: "post-1" })).toBeNull()
})
