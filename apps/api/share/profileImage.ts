// the link-preview card a pasted profile url renders as

import { toProfilePageTitle } from "@carlnotes/contracts/profilePage"
import type { CardElement } from "@carlnotes/pipeline/cardElementPng"
import type { PublishedAvatar } from "../avatars"
import {
	CARD_MUTED_COLOR,
	PREVIEW_TEMPLATE_VERSION,
	toAvatarIdentity,
	toBrandIcon,
	toCardPng,
	toCountLabel,
	toOwnerAvatar,
	toOwnerImageDataUri,
} from "./previewImage"

// how wide the avatar renders, filling the slot a topic card gives its title
const AVATAR_SIZE = 120

// what the profile card says about a user. the avatar is named, not loaded
export type ProfilePreview = {
	userId: string
	username: string
	avatar: PublishedAvatar
	publicTopicCount: number
	followerCount: number
}

/**
 * The stored object key for a profile preview card, versioned and hashed by its fields.
 */
export function toProfilePreviewKey(profilePreview: ProfilePreview): string {
	const previewImage = `${toProfilePageTitle(profilePreview.username)}|${toAvatarIdentity(profilePreview.avatar)}|${profilePreview.publicTopicCount}|${profilePreview.followerCount}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/profiles/${profilePreview.userId}/${Bun.hash(previewImage).toString(36)}.png`
}

/**
 * Render a profile's card to PNG bytes: the avatar and username as the title,
 * the public topic count bottom left, and the follower count bottom right.
 */
export async function toProfilePreviewPng(card: ProfilePreview): Promise<Uint8Array> {
	// the user's avatar bytes, only fetched here. the card's key names the avatar instead, so a stored card loads nothing
	const avatarImage = await toOwnerImageDataUri(card.avatar)
	return toCardPng([toBrandIcon(), toProfileOwner(card, avatarImage), toProfileFooter(card)])
}

// the profile owner title display: the image they publish, or their initials in their tint, then their Café's name
function toProfileOwner(profilePreview: ProfilePreview, avatarImage: string | null): CardElement {
	const avatar = toOwnerAvatar({
		id: profilePreview.userId,
		name: profilePreview.username,
		image: avatarImage,
		size: AVATAR_SIZE,
	})
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "28px" },
			children: [
				avatar,
				{
					type: "div",
					props: { style: { display: "flex", fontSize: 76 }, children: toProfilePageTitle(profilePreview.username) },
				},
			],
		},
	}
}

// the footer with the profile's count labels, one in each corner
function toProfileFooter(card: ProfilePreview): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", justifyContent: "space-between", fontSize: 30, color: CARD_MUTED_COLOR },
			children: [
				{ type: "div", props: { style: { display: "flex" }, children: toCountLabel(card.publicTopicCount, "topic") } },
				{ type: "div", props: { style: { display: "flex" }, children: toCountLabel(card.followerCount, "follower") } },
			],
		},
	}
}
