// Topic Post response tests: what the info popup reads beyond the card, its Topic's image and counts, and its
// discussion's time
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as viewerCounts from "../counts/viewerCounts"
import type { TopicPostRow } from "./topicPosts"
import {
	loadProfileOrderTopicPostRows,
	loadTopicPostCards,
	loadTopicPostCardsById,
	loadTopicPostRow,
	toTopicPostResponse,
} from "./topicPosts"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a member's published post with no image, on a public Topic that has one
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
		imageHash: null,
		imageOrigin: null,
		imagePrompt: null,
		imageUpdatedAt: null,
		homeOrder: null,
		profileOrder: null,
	},
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: null,
		name: "Home espresso",
		imageHash: "topichash",
	},
	author: { userId: "member-1", username: "member-1", avatarSource: "generated", avatarKey: null },
} as TopicPostRow

test("a post's response includes its Topic's image, and null for a Topic with none", async () => {
	stubConnectionPool()
	const topicPostResponse = await toTopicPostResponse(null, TOPIC_POST_ROW)
	expect(topicPostResponse.topicImage?.thumbnail.url).toBe("/api/topic-images/topic-1/topichash/thumbnail.webp")

	// a Topic with no image yet
	const noImageRow = { ...TOPIC_POST_ROW, topic: { ...TOPIC_POST_ROW.topic, imageHash: null } }
	expect((await toTopicPostResponse(null, noImageRow)).topicImage).toBeNull()
})

test("a post's response includes its Topic's viewers and subscribers as the Topic's own page reads them", async () => {
	stubConnectionPool()
	const loadTopicCounts = spyOn(viewerCounts, "loadTopicCounts").mockResolvedValue({
		counts: { viewerCount: 128, subscriberCount: 14 },
		isPublic: true,
	})
	expect((await toTopicPostResponse("reader-1", TOPIC_POST_ROW)).topicCounts).toEqual({
		viewerCount: 128,
		subscriberCount: 14,
	})
	expect(loadTopicCounts).toHaveBeenCalledWith("reader-1", "topic-1")

	// a reader who may not view the Topic reads no counts
	loadTopicCounts.mockResolvedValue(null)
	expect((await toTopicPostResponse("reader-1", TOPIC_POST_ROW)).topicCounts).toBeUndefined()
})

test("a post's response includes when its newest discussion with audio was recorded", async () => {
	// the newest recording with audio, and none on its way
	stubConnectionPool(({ text }) =>
		text.includes('from "topic_post_discussions"') && text.includes("is not null")
			? [["discussion-1", 184, "2026-11-10 09:00:00+00", "topic-post-discussions/post-1/discussion-1.mp3", 1024]]
			: [],
	)
	expect((await toTopicPostResponse(null, TOPIC_POST_ROW)).discussion).toEqual({
		id: "discussion-1",
		durationSeconds: 184,
		publishedAt: "2026-11-10T09:00:00.000Z",
		isRecording: false,
	})
})

test("a post's response includes its newest recording's script as a transcript, and a draft's includes none", async () => {
	// the newest recording with audio and its script of two turns, the second with a vocal tag
	const script = [
		{ speaker: "host", text: "This post starts light." },
		{ speaker: "cohost", text: "<laughs> And it stays there.", style: "warm" },
	]
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "topic_post_discussions"') && text.includes("is not null")
			? [
					[
						"discussion-1",
						184,
						"2026-11-10 09:00:00+00",
						"topic-post-discussions/post-1/discussion-1.mp3",
						1024,
						script,
					],
				]
			: [],
	)

	// each turn reads under its speaker's name, with no vocal tag and no delivery style
	expect((await toTopicPostResponse(null, TOPIC_POST_ROW)).discussion?.transcript).toEqual([
		{ speakerName: "Carl", text: "This post starts light." },
		{ speakerName: "Vienna", text: "And it stays there." },
	])

	// a draft reads no discussion
	sentQueries.length = 0
	const draftRow = { ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, publishedAt: null } }
	expect((await toTopicPostResponse("member-1", draftRow)).discussion).toBeNull()
	expect(sentQueries.some(({ text }) => text.includes('from "topic_post_discussions"'))).toBe(false)
})

test("a list of posts reads the card's columns and never a body or an image prompt, and one post's read keeps both", async () => {
	// a Topic's posts, a profile's posts, and the posts of some ids
	const sentQueries = stubConnectionPool(() => [])
	await loadTopicPostCards("member-1", "topic-1")
	await loadProfileOrderTopicPostRows(undefined)
	await loadTopicPostCardsById(["post-1"])

	// each list reads the title, and neither the body nor the image prompt
	const listReads = sentQueries.filter(({ text }) => text.includes('from "topic_posts"'))
	expect(listReads).toHaveLength(3)
	for (const { text } of listReads) {
		expect(text).toContain('"topic_posts"."title"')
		expect(text).not.toContain('"html"')
		expect(text).not.toContain('"image_prompt"')
		expect(text).not.toContain("limit")
	}

	// the read of one post keeps its body and its image prompt
	await loadTopicPostRow("post-1")
	expect(sentQueries.at(-1)?.text).toContain('"topic_posts"."html"')
	expect(sentQueries.at(-1)?.text).toContain('"topic_posts"."image_prompt"')
})
