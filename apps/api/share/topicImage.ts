// the link-preview card a pasted Topic url renders as
import type { Visibility } from "@carlnotes/contracts/enums"
import { toTopicImageOriginalKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import type { PublishedAvatar } from "../avatars"
import {
	CARD_MUTED_COLOR,
	type CardElement,
	loadCardImageBandDataUri,
	PREVIEW_TEMPLATE_VERSION,
	toAvatarIdentity,
	toBrandIcon,
	toCardPng,
	toCountLabel,
	toImageOverTextCardPng,
	toOwnerImageDataUri,
	toOwnerInitials,
	toOwnerPhoto,
} from "./previewImage"

// how wide the byline avatar renders, beside the owner's username in the footer
const AVATAR_SIZE = 56

// what a Topic's card and page head are built from. the avatar is named, not loaded, so the key below costs nothing to build
export type TopicPreview = {
	topicId: string
	title: string
	// the card is rendered for every topic, but only a public topic's page may disclose its findings
	visibility: Visibility
	// the topic owner's byline, and the image drawn beside it
	ownerUserId: string
	ownerUsername: string
	ownerAvatar: PublishedAvatar
	keptCount: number
	sourceCount: number
	// the content hash of the topic's image, null until it has one. the card draws the image across its top
	imageHash: string | null
	// the topic page's description. a public topic uses its last scan summary, prompt, or name,
	// and any other topic names only its owner and how many findings Carl kept
	description: string
}

/**
 * The stored object key for a topic preview card.
 *
 * It holds the template version and a hash of everything drawn, so changing a field generates a new preview url.
 * The social platforms never re-fetch a url they have seen, so the url itself has to change instead.
 */
export function toTopicPreviewKey(topicPreview: TopicPreview): string {
	const previewImage = `${topicPreview.title}|${topicPreview.ownerUsername}|${toAvatarIdentity(topicPreview.ownerAvatar)}|${topicPreview.keptCount}|${topicPreview.sourceCount}|${toDrawnImageHash(topicPreview) ?? ""}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/${topicPreview.topicId}/${Bun.hash(previewImage).toString(36)}.png`
}

/**
 * Render a Topic's card to PNG bytes: the Topic's name as the title,
 * the owner's avatar and username bottom left, and the finding and source counts bottom right.
 */
export async function toTopicPreviewPng(card: TopicPreview): Promise<Uint8Array> {
	// the user's avatar bytes, only fetched here. the card's key names the avatar instead, so a stored card loads nothing
	const ownerImage = await toOwnerImageDataUri(card.ownerAvatar)
	const footer = toTopicFooter(card, ownerImage)
	const drawnImageHash = toDrawnImageHash(card)
	if (!drawnImageHash) {
		return toCardPng([toBrandIcon(), toTopicTitle(card.title), footer])
	}

	// the topic's image across the top, with the text on the card under it
	const imageDataUri = await loadCardImageBandDataUri(toTopicImageOriginalKey(card.topicId, drawnImageHash))
	return toImageOverTextCardPng({ imageDataUri, title: card.title, footer })
}

// the image hash a card draws: a public topic's
function toDrawnImageHash(topicPreview: Pick<TopicPreview, "visibility" | "imageHash">): string | null {
	return topicPreview.visibility === "public" ? topicPreview.imageHash : null
}

// the Topic's own name as the card title, across the card with no image beside it
function toTopicTitle(title: string): CardElement {
	return {
		type: "div",
		props: { style: { display: "flex", fontSize: 76, lineHeight: 1.1, maxWidth: "100%" }, children: title },
	}
}

// the footer with the topic owner's username and finding counts
function toTopicFooter(card: TopicPreview, ownerImage: string | null): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 },
			children: [
				toTopicOwner(card, ownerImage),
				{
					type: "div",
					props: {
						style: { display: "flex", color: CARD_MUTED_COLOR },
						children: `${toCountLabel(card.keptCount, "finding")} · ${toCountLabel(card.sourceCount, "source")}`,
					},
				},
			],
		},
	}
}

// the topic owner display: the image they publish, or their initials in their tint, then their username
function toTopicOwner(topicPreview: TopicPreview, ownerImage: string | null): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "16px" },
			children: [
				ownerImage
					? toOwnerPhoto(ownerImage, AVATAR_SIZE)
					: toOwnerInitials(topicPreview.ownerUserId, topicPreview.ownerUsername, AVATAR_SIZE),
				{ type: "div", props: { style: { display: "flex" }, children: topicPreview.ownerUsername } },
			],
		},
	}
}
