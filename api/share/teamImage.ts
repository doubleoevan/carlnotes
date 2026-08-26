// the link-preview card a pasted team url renders as: the team's avatar and name, and what it holds
import type { PublishedAvatar } from "../avatars"
import {
	CARD_MUTED_COLOR,
	type CardNode,
	PREVIEW_TEMPLATE_VERSION,
	toAvatarIdentity,
	toBrandIcon,
	toCardPng,
	toCountLabel,
	toOwnerImageDataUri,
	toOwnerInitials,
	toOwnerPhoto,
} from "./previewImage"

// how wide the avatar renders, filling the slot a team card gives its title
const AVATAR_SIZE = 120

// what the team card says about a team: the avatar, the member count bottom left, and the topic count bottom right.
export type TeamPreview = {
	teamId: string
	name: string
	avatar: PublishedAvatar
	memberCount: number
	topicCount: number
}

/**
 * The stored object key for a team preview card, versioned and hashed by its fields.
 */
export function toTeamPreviewKey(teamPreview: TeamPreview): string {
	const previewImage = `${teamPreview.name}|${toAvatarIdentity(teamPreview.avatar)}|${teamPreview.memberCount}|${teamPreview.topicCount}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/teams/${teamPreview.teamId}/${Bun.hash(previewImage).toString(36)}.png`
}

/**
 * Render a team's card to PNG bytes: the avatar and name as the title,
 * the member count bottom left, and the topic count bottom right.
 */
export async function toTeamPreviewPng(previewCard: TeamPreview): Promise<Uint8Array> {
	// the team's avatar bytes, only fetched here. the card's key names the avatar instead, so a stored card loads nothing
	const avatarImage = await toOwnerImageDataUri(previewCard.avatar)
	return toCardPng([toBrandIcon(), toTeamIdentity(previewCard, avatarImage), toTeamFooter(previewCard)])
}

// the team title display: the image it publishes, or its initials in its tint, then its name
function toTeamIdentity(teamPreview: TeamPreview, avatarImage: string | null): CardNode {
	// the initials fall back to the team's name and id
	const avatar = avatarImage
		? toOwnerPhoto(avatarImage, AVATAR_SIZE)
		: toOwnerInitials(teamPreview.teamId, teamPreview.name, AVATAR_SIZE)
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "28px" },
			children: [avatar, toTeamName(teamPreview)],
		},
	}
}

// the name alone. a team's page lives at its id instead of a printable address
function toTeamName(teamPreview: TeamPreview): CardNode {
	return {
		type: "div",
		props: {
			style: { display: "flex", flexDirection: "column" },
			children: [{ type: "div", props: { style: { display: "flex", fontSize: 72 }, children: teamPreview.name } }],
		},
	}
}

// the footer with the team's count labels, one in each corner
function toTeamFooter(card: TeamPreview): CardNode {
	return {
		type: "div",
		props: {
			style: { display: "flex", justifyContent: "space-between", fontSize: 30, color: CARD_MUTED_COLOR },
			children: [
				{ type: "div", props: { style: { display: "flex" }, children: toCountLabel(card.memberCount, "member") } },
				{ type: "div", props: { style: { display: "flex" }, children: toCountLabel(card.topicCount, "topic") } },
			],
		},
	}
}
