// Topic Post page head tests: a public Topic's post is described by its summary, indexed, and named in BlogPosting
// structured data, and a private Topic's post keeps its words out of its head
import { expect, test } from "bun:test"
import { toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import type { TopicPreview } from "../share/topicImage"
import { toTopicPostPreview } from "../share/topicPostImage"
import { toTopicPostPageHead } from "./topicPostPageHead"
import type { TopicPostRow } from "./topicPosts"

// a published post on a public Topic, edited after it published
const TOPIC_POST_ROW: TopicPostRow = {
	topicPost: {
		...(toTableRow(topicPosts, {}) as unknown as TopicPostRow["topicPost"]),
		id: "post-1",
		topicId: "topic-1",
		authorUserId: "user-1",
		title: "Light Roasts",
		html: "<p>Start light and stay curious.</p>",
		summary: "A year of light roasts, ranked.",
		wordCount: 320,
		version: 2,
		createdAt: new Date("2026-11-01T09:00:00Z"),
		publishedAt: new Date("2026-11-01T10:00:00Z"),
		editedAt: new Date("2026-11-01T10:05:00Z"),
	},
	topic: { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: null, name: "Coffee", imageHash: null },
	author: { userId: "user-1", username: "CoffeeReader", avatarSource: "generated", avatarKey: null },
}

// the Topic's preview, which describes a private Topic's post and gives every post its card image
const TOPIC_PREVIEW = {
	topicId: "topic-1",
	title: "Coffee",
	description: "Carl reads about coffee.",
	visibility: "public",
	keptCount: 0,
	imageHash: null,
	ownerUsername: "owner",
} as unknown as TopicPreview

// a post's page head, with the post's card built from the same row and Topic preview
function toTestTopicPostPageHead(options: {
	topicPostRow: TopicPostRow
	topicPreview: TopicPreview
	appUrl: string
}): ReturnType<typeof toTopicPostPageHead> {
	const topicPostPreview = toTopicPostPreview({ ...options, authorAvatar: null })
	return toTopicPostPageHead({ ...options, topicPostPreview })
}

test("a public Topic's post head has its summary, its canonical url, its card, and BlogPosting data", () => {
	const pageHead = toTestTopicPostPageHead({
		topicPostRow: TOPIC_POST_ROW,
		topicPreview: TOPIC_PREVIEW,
		appUrl: "https://carlnotes.com",
	})

	// the summary describes it, and the page is indexed at its own path
	const pageUrl = "https://carlnotes.com/topics/topic-1/coffee/posts/post-1/light-roasts"
	expect(pageHead.description).toBe("A year of light roasts, ranked.")
	expect(pageHead.canonicalUrl).toBe(pageUrl)
	expect(pageHead.isIndexed).toBe(true)
	expect(pageHead.imageUrl).toMatch(/^https:\/\/carlnotes\.com\/api\/topic-posts\/post-1\/preview\.png\?v=[a-z0-9]+$/)

	// the structured data names the headline, the author, both times, and the image
	expect(pageHead.jsonLd).toMatchObject({
		"@type": "BlogPosting",
		headline: "Light Roasts",
		url: pageUrl,
		datePublished: "2026-11-01T10:00:00.000Z",
		dateModified: "2026-11-01T10:05:00.000Z",
		author: { "@type": "Person", name: "CoffeeReader", url: "https://carlnotes.com/profiles/user-1" },
		image: pageHead.imageUrl,
	})
})

test("a post with an image names a new card version, and its structured data names the image at its hash", () => {
	const pageHead = toTestTopicPostPageHead({
		topicPostRow: { ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, imageHash: "abc123" } },
		topicPreview: TOPIC_PREVIEW,
		appUrl: "https://carlnotes.com",
	})
	const imagelessPageHead = toTestTopicPostPageHead({
		topicPostRow: TOPIC_POST_ROW,
		topicPreview: TOPIC_PREVIEW,
		appUrl: "https://carlnotes.com",
	})

	// the card's url changes with the image, and the article's image is the post's own
	expect(pageHead.imageUrl).toContain("https://carlnotes.com/api/topic-posts/post-1/preview.png?v=")
	expect(pageHead.imageUrl).not.toBe(imagelessPageHead.imageUrl)
	expect(pageHead.jsonLd).toMatchObject({
		image: "https://carlnotes.com/api/topic-post-images/post-1/abc123/page@2x.webp",
	})
})

test("a post with no summary yet is described by how its text starts", () => {
	const pageHead = toTestTopicPostPageHead({
		topicPostRow: { ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, summary: null } },
		topicPreview: TOPIC_PREVIEW,
		appUrl: "https://carlnotes.com",
	})
	expect(pageHead.description).toBe("Start light and stay curious.")
})

test("a private Topic's post head keeps the post's words out, with no canonical url and no structured data", () => {
	const pageHead = toTestTopicPostPageHead({
		topicPostRow: { ...TOPIC_POST_ROW, topic: { ...TOPIC_POST_ROW.topic, visibility: "private" } },
		topicPreview: TOPIC_PREVIEW,
		appUrl: "https://carlnotes.com",
	})

	// the Topic's own description shows, and the page is not indexed
	expect(pageHead.description).toBe("Carl reads about coffee.")
	expect(pageHead.canonicalUrl).toBeNull()
	expect(pageHead.isIndexed).toBe(false)
	expect(pageHead.jsonLd).toBeNull()
	expect(JSON.stringify(pageHead)).not.toContain("light roasts, ranked")
})

test("a private Topic's post card is the same whether or not the post has an image of its own", () => {
	const privateTopicPreview = { ...TOPIC_PREVIEW, visibility: "private" } as TopicPreview
	const pageHead = toTestTopicPostPageHead({
		topicPostRow: { ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, imageHash: "abc123" } },
		topicPreview: privateTopicPreview,
		appUrl: "https://carlnotes.com",
	})
	const imagelessPageHead = toTestTopicPostPageHead({
		topicPostRow: TOPIC_POST_ROW,
		topicPreview: privateTopicPreview,
		appUrl: "https://carlnotes.com",
	})

	// the card draws the Topic's image, so the post's own image never changes it
	expect(pageHead.imageUrl).toBe(imagelessPageHead.imageUrl)
})
