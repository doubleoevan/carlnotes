// Topic Post response tests: what the info popup reads beyond the card, its Topic's image and counts, and its
// discussion's time
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as viewerCounts from "../counts/viewerCounts"
import { toTopicPostResponse } from "./topicPostResponse"
import type { TopicPostRow } from "./topicPosts"
import {
	loadProfileOrderTopicPostRows,
	loadTopicPostCardRowsById,
	loadTopicPostCards,
	loadTopicPostCardsPage,
	loadTopicPostRow,
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
	author: { userId: "member-1", username: "member-1", avatarSource: "generated", avatarKey: null, image: null },
	topicCounts: { viewerCount: 128, subscriberCount: 14 },
} as TopicPostRow

test("a post's response includes its Topic's image, and null for a Topic with none", async () => {
	stubConnectionPool()
	const topicPostResponse = await toTopicPostResponse(null, TOPIC_POST_ROW)
	expect(topicPostResponse.topicImage?.thumbnail.url).toBe("/api/topic-images/topic-1/topichash/thumbnail.webp")

	// a Topic with no image yet
	const noImageRow = { ...TOPIC_POST_ROW, topic: { ...TOPIC_POST_ROW.topic, imageHash: null } }
	expect((await toTopicPostResponse(null, noImageRow)).topicImage).toBeNull()
})

test("a post's response includes its Topic's viewers and subscribers from the counts its row includes", async () => {
	// the Topic's counts come from the post's own row, and no Topic is read again
	const sentQueries = stubConnectionPool()
	const toTopicCountsFromRow = spyOn(viewerCounts, "toTopicCountsFromRow").mockResolvedValue({
		counts: { viewerCount: 128, subscriberCount: 14 },
		isPublic: true,
	})
	expect((await toTopicPostResponse("reader-1", TOPIC_POST_ROW)).topicCounts).toEqual({
		viewerCount: 128,
		subscriberCount: 14,
	})
	expect(toTopicCountsFromRow).toHaveBeenCalledWith("reader-1", {
		...TOPIC_POST_ROW.topic,
		viewerCount: 128,
		subscriberCount: 14,
	})
	expect(sentQueries.some(({ text }) => text.includes('from "topics"'))).toBe(false)

	// a reader who may not view the Topic reads no counts
	toTopicCountsFromRow.mockResolvedValue(null)
	expect((await toTopicPostResponse("reader-1", TOPIC_POST_ROW)).topicCounts).toBeUndefined()
})

test("a post's response reads its newest discussion with audio and one recording in one read", async () => {
	// an older recording with audio is left out by the read, and a newer one is on its way
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "topic_post_discussions"')
			? [
					["discussion-2", null, null, null, null, null, "recording"],
					["discussion-1", 184, "2026-11-10 09:00:00+00", "key.mp3", 1024, null, "published"],
				]
			: [],
	)
	expect((await toTopicPostResponse(null, TOPIC_POST_ROW)).discussion).toMatchObject({
		id: "discussion-1",
		durationSeconds: 184,
		isRecording: true,
	})
	expect(sentQueries.filter(({ text }) => text.includes('from "topic_post_discussions"'))).toHaveLength(1)
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
	await loadTopicPostCardRowsById(["post-1"])

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

test("one page of a Topic's posts reads six cards after the pages before it, and counts every post the list holds", async () => {
	// no card, and a list of eight posts
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(") ? [[8]] : []))
	const topicPostCardsPage = await loadTopicPostCardsPage("member-1", "topic-1", 1)
	expect(topicPostCardsPage).toEqual({ topicPosts: [], totalCount: 8 })

	// the page read is limited to six rows after the first page, in an order the id settles, and the count reads no row
	const [pageRead, countRead] = sentQueries.filter(({ text }) => text.includes('from "topic_posts"'))
	expect(pageRead?.text).toContain('"topic_posts"."id" desc limit')
	expect(pageRead?.values.slice(-2)).toEqual([6, 6])
	expect(countRead?.text).toContain("count(")
	expect(countRead?.text).not.toContain("limit")
})
