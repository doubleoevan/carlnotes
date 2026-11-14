// the link-preview card that a pasted Topic Post url renders as
import type { CardElement } from "@carlnotes/pipeline/cardElementPng"
import { toTopicImageOriginalKey, toTopicPostImageOriginalKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import type { PublishedAvatar } from "../avatars"
import type { TopicPostRow } from "../topicPost/topicPosts"
import {
	CARD_MUTED_COLOR,
	loadCardImageBandDataUri,
	PREVIEW_TEMPLATE_VERSION,
	toAvatarIdentity,
	toBrandIcon,
	toCardPng,
	toImageOverTextCardPng,
	toOwnerAvatar,
	toOwnerImageDataUri,
} from "./previewImage"
import type { TopicPreview } from "./topicImage"

// how wide the byline avatar renders, beside the username in the footer
const AVATAR_SIZE = 56

// what a Topic Post's card is built from. the avatar is named, not loaded, so the key below costs nothing to build
export type TopicPostPreview = {
	topicPostId: string
	title: string
	topicId: string
	topicName: string
	// whose byline the footer draws: the post's author on a public Topic, and the Topic's owner on any other
	bylineUserId: string
	bylineUsername: string
	bylineAvatar: PublishedAvatar
	// the content hash of the post's own image, null until it is drawn and on a Topic that is not public
	topicPostImageHash: string | null
	// the content hash of its Topic's image, null until it has one
	topicImageHash: string | null
}

// the published Topic Post, its Topic's preview, and its author's published avatar that a card is built from
type ToTopicPostPreviewOptions = {
	topicPostRow: TopicPostRow
	topicPreview: TopicPreview
	authorAvatar: PublishedAvatar
}

/**
 * Builds a Topic Post's preview card fields. A public Topic's post shows its own image and its author. A post of any
 * other Topic shows what its Topic's card shows, the Topic's image and owner, with the post's title.
 */
export function toTopicPostPreview({
	topicPostRow,
	topicPreview,
	authorAvatar,
}: ToTopicPostPreviewOptions): TopicPostPreview {
	// the post's title over its Topic's name, on every card
	const { topicPost, author } = topicPostRow
	const titledPreview = {
		topicPostId: topicPost.id,
		title: topicPost.title,
		topicId: topicPreview.topicId,
		topicName: topicPreview.title,
		topicImageHash: topicPreview.imageHash,
	}

	// a private or invite Topic's card names its owner and draws its image, so its post's card does the same
	if (topicPreview.visibility !== "public") {
		return {
			...titledPreview,
			bylineUserId: topicPreview.ownerUserId,
			bylineUsername: topicPreview.ownerUsername,
			bylineAvatar: topicPreview.ownerAvatar,
			topicPostImageHash: null,
		}
	}
	return {
		...titledPreview,
		bylineUserId: author.userId,
		bylineUsername: author.username,
		bylineAvatar: authorAvatar,
		topicPostImageHash: topicPost.imageHash,
	}
}

/**
 * The stored object key for a Topic Post preview card.
 *
 * It holds the template version and a hash of everything drawn, so changing a field generates a new preview url.
 */
export function toTopicPostPreviewKey(topicPostPreview: TopicPostPreview): string {
	// hash the drawn fields into the object key
	const { topicPostId, title, topicName, bylineUsername, bylineAvatar } = topicPostPreview
	const imageHashes = `${topicPostPreview.topicPostImageHash ?? ""}|${topicPostPreview.topicImageHash ?? ""}`
	const previewImage = `${title}|${topicName}|${bylineUsername}|${toAvatarIdentity(bylineAvatar)}|${imageHashes}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/topic-posts/${topicPostId}/${Bun.hash(previewImage).toString(36)}.png`
}

/**
 * Renders a Topic Post's preview card to PNG bytes: the post's own image across the top, or its Topic's until the
 * post has one, with the title, the byline, and the Topic's name on the card under it.
 */
export async function toTopicPostPreviewPng(topicPostPreview: TopicPostPreview): Promise<Uint8Array> {
	// the stored original the card crops, the post's own first
	const { topicPostId, topicId, title, topicPostImageHash, topicImageHash } = topicPostPreview
	const originalKey = topicPostImageHash
		? toTopicPostImageOriginalKey(topicPostId, topicPostImageHash)
		: topicImageHash
			? toTopicImageOriginalKey(topicId, topicImageHash)
			: null

	// the avatar's bytes, fetched only here. the card's key names the avatar instead, so a stored card loads nothing
	const bylineImage = await toOwnerImageDataUri(topicPostPreview.bylineAvatar, AVATAR_SIZE)
	const footer = toTopicPostFooter(topicPostPreview, bylineImage)

	// the text card with no image, or the image across the top
	if (!originalKey) {
		return toCardPng([toBrandIcon(), toTopicPostTitle(title), footer])
	}
	return toImageOverTextCardPng({ imageDataUri: await loadCardImageBandDataUri(originalKey), title, footer })
}

// the post's title as the card title, across the card with no image over it
function toTopicPostTitle(title: string): CardElement {
	return {
		type: "div",
		props: { style: { display: "block", lineClamp: 3, fontSize: 64, lineHeight: 1.1 }, children: title },
	}
}

// the footer with the byline at the left and the Topic's name on one line at the right
function toTopicPostFooter(topicPostPreview: TopicPostPreview, bylineImage: string | null): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "32px", fontSize: 30 },
			children: [
				toTopicPostByline(topicPostPreview, bylineImage),
				{
					type: "div",
					props: {
						style: { display: "block", lineClamp: 1, flex: 1, textAlign: "right", color: CARD_MUTED_COLOR },
						children: topicPostPreview.topicName,
					},
				},
			],
		},
	}
}

// the byline: the image its user publishes, or their initials in their tint, then their username
function toTopicPostByline(topicPostPreview: TopicPostPreview, bylineImage: string | null): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 },
			children: [
				toOwnerAvatar({
					id: topicPostPreview.bylineUserId,
					name: topicPostPreview.bylineUsername,
					image: bylineImage,
					size: AVATAR_SIZE,
				}),
				{ type: "div", props: { style: { display: "flex" }, children: topicPostPreview.bylineUsername } },
			],
		},
	}
}
