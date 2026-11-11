// Topic Post card tests: what a public Topic's post and a private or invite Topic's post show, the key that changes
// with what is drawn, the rendered png, and the card an invite shared from a post shows
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import * as store from "@carlnotes/db/store"
import * as avatars from "../avatars"
import type { TopicPostRow } from "../topicPost/topicPosts"
import * as topicPostRows from "../topicPost/topicPosts"
import * as preview from "./preview"
import type { TopicPreview } from "./topicImage"
import { toTopicPostPreview, toTopicPostPreviewKey, toTopicPostPreviewPng } from "./topicPostImage"

// a published post by a team member, with its own image, on the owner's Topic
const TOPIC_POST_ROW: TopicPostRow = {
	topicPost: {
		...(toTableRow(topicPosts, {}) as unknown as TopicPostRow["topicPost"]),
		id: "post-1",
		topicId: "topic-1",
		authorUserId: "member-1",
		title: "Light Roasts",
		imageHash: "posthash",
		publishedAt: new Date("2026-11-01T10:00:00Z"),
	},
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: null,
		name: "Coffee",
		imageHash: "topichash",
	},
	author: { userId: "member-1", username: "CoffeeReader", avatarSource: "upload", avatarKey: "avatars/member-1.png" },
}

// the Topic's preview, with its owner's byline and its image
const TOPIC_PREVIEW: TopicPreview = {
	topicId: "topic-1",
	title: "Coffee",
	visibility: "public",
	ownerUserId: "owner-1",
	ownerUsername: "TopicOwner",
	ownerAvatar: null,
	keptCount: 4,
	sourceCount: 2,
	imageHash: "topichash",
	description: "Carl reads about coffee.",
}

// the author's uploaded avatar, as the card's loader reads it
const AUTHOR_AVATAR = { avatarKey: "avatars/member-1.png" }

// the invite Topic's row as the Topic preview's read selects it: the Topic's fields, then its owner's
const INVITE_TOPIC_PREVIEW_ROW = ["topic-1", "Coffee", null, null, "invite", "topichash", "owner-1", "TopicOwner"]

afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test("a public Topic's post card shows the post's image, its title, its author, and its Topic's name", () => {
	const topicPostPreview = toTopicPostPreview({
		topicPostRow: TOPIC_POST_ROW,
		topicPreview: TOPIC_PREVIEW,
		authorAvatar: AUTHOR_AVATAR,
	})
	expect(topicPostPreview).toEqual({
		topicPostId: "post-1",
		title: "Light Roasts",
		topicId: "topic-1",
		topicName: "Coffee",
		// the author's byline, and both images' hashes
		bylineUserId: "member-1",
		bylineUsername: "CoffeeReader",
		bylineAvatar: AUTHOR_AVATAR,
		topicPostImageHash: "posthash",
		topicImageHash: "topichash",
	})
})

test("an invite or private Topic's post card shows its Topic's image and owner, with the post's title", () => {
	for (const visibility of ["invite", "private"] as const) {
		const topicPostPreview = toTopicPostPreview({
			topicPostRow: TOPIC_POST_ROW,
			topicPreview: { ...TOPIC_PREVIEW, visibility },
			authorAvatar: AUTHOR_AVATAR,
		})

		// the post's title over the Topic's name, with the owner in the author's place and no image of the post's own
		expect(topicPostPreview.title).toBe("Light Roasts")
		expect(topicPostPreview.topicName).toBe("Coffee")
		expect(topicPostPreview.bylineUserId).toBe("owner-1")
		expect(topicPostPreview.bylineUsername).toBe("TopicOwner")
		expect(topicPostPreview.bylineAvatar).toBeNull()

		// neither the post's own image nor its author's name reaches the card
		expect(topicPostPreview.topicPostImageHash).toBeNull()
		expect(JSON.stringify(topicPostPreview)).not.toContain("CoffeeReader")
	}
})

test("a card's key holds the post's id, and changes with its title and with its image", () => {
	const topicPostPreview = toTopicPostPreview({
		topicPostRow: TOPIC_POST_ROW,
		topicPreview: TOPIC_PREVIEW,
		authorAvatar: AUTHOR_AVATAR,
	})
	const previewKey = toTopicPostPreviewKey(topicPostPreview)

	// the same fields name the same key, and a new title or a new image names a new one
	expect(previewKey).toMatch(/^og\/v\d+\/topic-posts\/post-1\/[a-z0-9]+\.png$/)
	expect(toTopicPostPreviewKey({ ...topicPostPreview })).toBe(previewKey)
	expect(toTopicPostPreviewKey({ ...topicPostPreview, title: "Dark Roasts" })).not.toBe(previewKey)
	expect(toTopicPostPreviewKey({ ...topicPostPreview, topicPostImageHash: "newhash" })).not.toBe(previewKey)
})

test("a post with no image of its own or of its Topic's renders the text card as a png", async () => {
	const topicPostPreview = toTopicPostPreview({
		topicPostRow: { ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, imageHash: null } },
		topicPreview: { ...TOPIC_PREVIEW, imageHash: null },
		authorAvatar: null,
	})
	const pngBytes = await toTopicPostPreviewPng(topicPostPreview)

	// the png signature
	expect([...pngBytes.slice(0, 4)]).toEqual([137, 80, 78, 71])
})

test("a draft has no card", async () => {
	spyOn(topicPostRows, "loadTopicPostRow").mockResolvedValue({
		...TOPIC_POST_ROW,
		topicPost: { ...TOPIC_POST_ROW.topicPost, publishedAt: null },
	})
	expect(await preview.loadTopicPostPreview("post-1")).toBeNull()
})

test("an invite shared from a Topic Post shows the post's card, and the Topic's once the post is gone", async () => {
	// a stored card for every key, so nothing renders, and the keys each read asks for
	const cardKeys: string[] = []
	spyOn(store, "attachmentExists").mockResolvedValue(true)
	spyOn(store, "getAttachmentBytes").mockImplementation(async (cardKey) => {
		cardKeys.push(cardKey)
		return new Uint8Array([137, 80, 78, 71])
	})

	// the invite Topic's row and its counts, the author's avatar, and the post, which is then deleted
	stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [INVITE_TOPIC_PREVIEW_ROW] : [[0]]))
	spyOn(avatars, "toPublishedAvatar").mockResolvedValue(AUTHOR_AVATAR)
	const loadTopicPostRowSpy = spyOn(topicPostRows, "loadTopicPostRow").mockResolvedValue(TOPIC_POST_ROW)
	await preview.toCachedInvitePreviewPng({ topicId: "topic-1", topicPostId: "post-1" })
	loadTopicPostRowSpy.mockResolvedValue(null)
	await preview.toCachedInvitePreviewPng({ topicId: "topic-1", topicPostId: "post-1" })

	// the post's card first, then the Topic's own
	expect(cardKeys[0]).toContain("/topic-posts/post-1/")
	expect(cardKeys[1]).toContain("/topic-1/")
	expect(cardKeys[1]).not.toContain("topic-posts")
})
