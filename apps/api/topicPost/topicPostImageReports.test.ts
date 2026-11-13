// Topic Post image report tests: a reporter no longer sees the image they reported until it changes, a body image they
// reported leaves the body they read, and the report names the post's title and page
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicPostBodyImagePath } from "@carlnotes/contracts/topicPostBodyImages"
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

// a published post whose body shows two images
const TOPIC_POST_ID = "11111111-1111-4111-8111-111111111111"
const [REPORTED_IMAGE_ID, KEPT_IMAGE_ID] = [crypto.randomUUID(), crypto.randomUUID()]
const toImageHtml = (imageId: string): string =>
	`<img src="${toTopicPostBodyImagePath({ topicPostId: TOPIC_POST_ID, imageId })}" alt="" width="4" height="3" />`
const BODY_IMAGE_ROW = {
	...TOPIC_POST_ROW,
	topicPost: {
		...TOPIC_POST_ROW.topicPost,
		id: TOPIC_POST_ID,
		html: `<p>Start light.</p>${toImageHtml(REPORTED_IMAGE_ID)}${toImageHtml(KEPT_IMAGE_ID)}`,
	},
} as TopicPostRow

test("a reader who reported a body image reads the body without it, and its author still sees it", async () => {
	// reader-1 reported one of the two images
	stubConnectionPool(({ text, values }) =>
		text.includes('from "reports"') && values.includes("reader-1") && values.includes("topicPostBodyImage")
			? [[`${TOPIC_POST_ID}/${REPORTED_IMAGE_ID}`]]
			: [],
	)
	const reporterHtml = (await toTopicPostResponse("reader-1", BODY_IMAGE_ROW)).html
	expect(reporterHtml).not.toContain(REPORTED_IMAGE_ID)
	expect(reporterHtml).toContain(KEPT_IMAGE_ID)
	expect(reporterHtml).toContain("Start light.")

	// another reader sees both
	const readerHtml = (await toTopicPostResponse("reader-2", BODY_IMAGE_ROW)).html
	expect(readerHtml).toContain(REPORTED_IMAGE_ID)
})

test("a report of a body image names its post, and an image the body no longer shows has nothing to report", async () => {
	stubConnectionPool()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(BODY_IMAGE_ROW)
	const subjectId = `${TOPIC_POST_ID}/${REPORTED_IMAGE_ID}`
	expect(await toReportedSubject("reader-1", { subjectKind: "topicPostBodyImage", subjectId })).toMatchObject({
		kind: "topicPostBodyImage",
		id: subjectId,
		label: "Dialing in",
		authorUserId: "member-1",
	})
	const goneSubjectId = `${TOPIC_POST_ID}/${crypto.randomUUID()}`
	expect(
		await toReportedSubject("reader-1", { subjectKind: "topicPostBodyImage", subjectId: goneSubjectId }),
	).toBeNull()
})
