// the topic's link-preview card that a pasted Topic url renders as: JSX to SVG with Satori, SVG to PNG with resvg.
// Satori cannot use system fonts, so the font is added beside this file and passed in as bytes
import { Resvg } from "@resvg/resvg-js"
import { AVATAR_INK, toAvatarInitials, toAvatarTint } from "@shared/avatars"
import satori from "satori"
import { getAttachmentBytes } from "../../worker"
import { MAX_AVATAR_BYTES, type PublishedAvatar, toAvatarContentType } from "../avatars"

// what every platform crops preview images to. 1200x630 is the size X, Slack, and LinkedIn all expect
export const PREVIEW_WIDTH = 1200
export const PREVIEW_HEIGHT = 630

// bump this when the card's design changes. Slack and X cache preview images hard and ignore cache headers.
export const PREVIEW_TEMPLATE_VERSION = "v3"

// how wide the byline avatar draws, and how much time a provider photo gets to load before the card gives up on it
const AVATAR_SIZE = 56
const PROVIDER_PHOTO_TIMEOUT_MS = 3000

// the brand font, read once at boot. Satori takes font bytes, not a font-family name or a stylesheet
const displayFont = await Bun.file(new URL("./fonts/ArchitectsDaughter-Regular.ttf", import.meta.url)).arrayBuffer()

// the card's palette, taken from the dark theme so a preview can look like the app
const CARD_BACKGROUND = "#2a1f14"
const CARD_INK = "#f0e6d6"
const CARD_ACCENT = "#f09050"
const CARD_MUTED = "#b9a68e"

// one node of the card's markup tree, which is the shape satori reads instead of React elements.
// svg nodes carry their attributes as extra props beside style and children
type CardNode = {
	type: string
	props: { style?: Record<string, unknown>; children?: (CardNode | string)[] | string } & Record<string, unknown>
}

// what the card says about a Topic. the avatar is named, not loaded, so the key below costs nothing to build
export type TopicPreview = {
	topicId: string
	title: string
	// the owner's byline, and the image drawn beside it
	ownerUserId: string
	ownerUsername: string
	ownerAvatar: PublishedAvatar
	keptCount: number
	sourceCount: number
}

/**
 * The stored object key for a topic preview card.
 *
 * It holds the template version and a hash of everything drawn, so a retitled Topic or a redesigned card both land on a new preview url.
 * The social platforms never re-fetch a url they have seen, so the url has to change instead.
 */
export function toPreviewKey(card: TopicPreview): string {
	const previewImage = `${card.title}|${card.ownerUsername}|${toAvatarIdentity(card.ownerAvatar)}|${card.keptCount}|${card.sourceCount}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/${card.topicId}/${Bun.hash(previewImage).toString(36)}.png`
}

// what names the rendered avatar in the avatar key. a stored upload's avatar key already carries its own stamp.
// a provider photo's url changes when the photo does, so either one changing is enough to give the card on a new url
function toAvatarIdentity(avatar: PublishedAvatar): string {
	if (!avatar) {
		return "initials"
	}
	return "avatarKey" in avatar ? avatar.avatarKey : avatar.imageUrl
}

/**
 * Render a Topic's card to PNG bytes.
 */
export async function toPreviewPng(card: TopicPreview): Promise<Uint8Array> {
	// the owner's real image, read-only now, on the miss that is actually rendering something
	const ownerImage = await toOwnerImageDataUri(card.ownerAvatar)
	// satori generates the topic-specific svg
	const previewSvg = await satori(toPreviewMarkup(card, ownerImage) as Parameters<typeof satori>[0], {
		width: PREVIEW_WIDTH,
		height: PREVIEW_HEIGHT,
		fonts: [{ name: "Architects Daughter", data: displayFont, weight: 400, style: "normal" }],
	})
	// resvg rasterizes at the card's own width, so the png comes out at exactly the size the platforms crop to
	return new Resvg(previewSvg, { fitTo: { mode: "width", value: PREVIEW_WIDTH } }).render().asPng()
}

// the owner's published image as bytes satori can draw, or null to fall back to their initials.
// satori has no network of its own, so a remote provider photo is fetched here and inlined
async function toOwnerImageDataUri(avatar: PublishedAvatar): Promise<string | null> {
	if (!avatar) {
		return null
	}
	try {
		// a stored upload comes from the app's own bucket, and its avatar key names the type to serve it as
		if ("avatarKey" in avatar) {
			const bytes = await getAttachmentBytes(avatar.avatarKey)
			return `data:${toAvatarContentType(avatar.avatarKey)};base64,${Buffer.from(bytes).toString("base64")}`
		}
		// a provider photo is somebody else's url, so it is bounded by a timeout and a size before being read
		const response = await fetch(avatar.imageUrl, { signal: AbortSignal.timeout(PROVIDER_PHOTO_TIMEOUT_MS) })
		if (!response.ok) {
			return null
		}
		const bytes = await toBoundedBytes(response)
		if (!bytes) {
			return null
		}
		// what the provider says it sent, falling back to the format a provider photo almost always is
		const contentType = response.headers.get("content-type") ?? "image/jpeg"
		return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
	} catch (error) {
		// an unreadable image draws the initials instead, since a card with no avatar still beats no card
		console.error("preview avatar load failed", error)
		return null
	}
}

// a response's bytes, or null once it runs past the size an avatar can be. read chunk by chunk rather than
// buffered whole, since the url belongs to the provider and nothing about the response is ours to trust
async function toBoundedBytes(response: Response): Promise<Uint8Array | null> {
	if (!response.body) {
		return null
	}
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let byteLength = 0
	// the running total is checked before a chunk is kept, so nothing past the cap is ever held
	while (true) {
		const { done, value } = await reader.read()
		if (done) {
			break
		}
		// past the cap the rest is never asked for, so an endless response cannot keep the render open
		byteLength += value.byteLength
		if (byteLength > MAX_AVATAR_BYTES) {
			await reader.cancel()
			return null
		}
		chunks.push(value)
	}
	// one image, joined back together now that its whole size is known to be within the cap
	return Buffer.concat(chunks)
}

// the preview topic card's layout. Satori takes React-shaped objects instead of components, and supports a flexbox subset
function toPreviewMarkup(card: TopicPreview, ownerImage: string | null): CardNode {
	return {
		type: "div",
		props: {
			style: {
				height: "100%",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				backgroundColor: CARD_BACKGROUND,
				color: CARD_INK,
				fontFamily: "Architects Daughter",
				padding: "64px",
			},
			children: [toWordmark(), toTitle(card.title), toFooter(card, ownerImage)],
		},
	}
}

// the brand line, so a card is recognizable before the title is read
function toWordmark(): CardNode {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "14px", fontSize: 36, color: CARD_ACCENT },
			children: [toMug(), "CarlNotes"],
		},
	}
}

// the header's coffee mug, drawn from the same paths CoffeeMug.tsx renders
function toMug(): CardNode {
	const steamWisps = [11.5, 15, 18.5].map((x) => ({
		type: "path",
		props: {
			d: `M${x} 10.5 q-2 -1.6 0 -3.2 q2 -1.6 0 -3.2`,
			stroke: CARD_ACCENT,
			strokeWidth: 1.5,
			strokeLinecap: "round",
			opacity: 0.7,
		},
	}))
	// the cup body is drawn twice, once as a faint fill and once as the outline, then the handle
	return {
		type: "svg",
		props: {
			viewBox: "0 0 32 32",
			width: 44,
			height: 44,
			fill: "none",
			children: [
				...steamWisps,
				{ type: "path", props: { d: "M8 13 L8 17 A7 7 0 0 0 22 17 L22 13 Z", fill: CARD_ACCENT, opacity: 0.2 } },
				{
					type: "path",
					props: {
						d: "M8 13 L8 17 A7 7 0 0 0 22 17 L22 13 Z",
						stroke: CARD_ACCENT,
						strokeWidth: 1.8,
						strokeLinejoin: "round",
					},
				},
				{ type: "path", props: { d: "M22 15 h2.5 a3 3 0 0 1 0 6 H22", stroke: CARD_ACCENT, strokeWidth: 1.8 } },
			],
		},
	}
}

// the Topic's own name, the largest thing on the card
function toTitle(title: string): CardNode {
	return {
		type: "div",
		props: { style: { display: "flex", fontSize: 76, lineHeight: 1.1, maxWidth: "100%" }, children: title },
	}
}

// the footer with the topic owner's username and finding counts
function toFooter(card: TopicPreview, ownerImage: string | null): CardNode {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 },
			children: [
				toTopicOwner(card, ownerImage),
				{
					type: "div",
					props: {
						style: { display: "flex", color: CARD_MUTED },
						children: `${toCountLabel(card.keptCount, "finding")} · ${toCountLabel(card.sourceCount, "source")}`,
					},
				},
			],
		},
	}
}

// a count and its word pluralized if necessary
function toCountLabel(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`
}

// the topic owner display: the image they publish, or their initials on their tint, then their username
function toTopicOwner(card: TopicPreview, ownerImage: string | null): CardNode {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "16px" },
			children: [
				ownerImage ? toOwnerPhoto(ownerImage) : toOwnerInitials(card),
				{ type: "div", props: { style: { display: "flex" }, children: card.ownerUsername } },
			],
		},
	}
}

// the published topic owner image, cropped to fit the same circle the initials draw
function toOwnerPhoto(ownerImage: string): CardNode {
	return {
		type: "img",
		props: {
			src: ownerImage,
			width: AVATAR_SIZE,
			height: AVATAR_SIZE,
			style: { borderRadius: AVATAR_SIZE / 2, objectFit: "cover" },
		},
	}
}

// the default username initials image that the app renders
function toOwnerInitials(card: TopicPreview): CardNode {
	return {
		type: "div",
		props: {
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: AVATAR_SIZE,
				height: AVATAR_SIZE,
				borderRadius: AVATAR_SIZE / 2,
				backgroundColor: toAvatarTint(card.ownerUserId),
				color: AVATAR_INK,
				fontSize: 24,
			},
			children: toAvatarInitials(card.ownerUsername),
		},
	}
}
