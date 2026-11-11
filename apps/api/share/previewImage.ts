// the shared link-preview card image methods

import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@carlnotes/contracts/avatars"
import { getAttachmentBytes } from "@carlnotes/db/store"
import { darkRoast } from "@carlnotes/nightshift/colors"
import { type CardElement, toCardElementPng, toImageDataUri } from "@carlnotes/pipeline/cardElementPng"
import { toTopicImageCardJpeg } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { MAX_AVATAR_BYTES, type PublishedAvatar, toAvatarContentType } from "../avatars"

// what every platform crops preview images to. 1200x630 is the size X, Slack, and LinkedIn all expect
const PREVIEW_WIDTH = 1200
const PREVIEW_HEIGHT = 630

// bump this when the card's design changes. Slack and X cache preview images hard and ignore cache headers.
export const PREVIEW_TEMPLATE_VERSION = "v5"

/**
 * Returns the version that a card's url names: a short hash of its storage key, which changes with the card.
 */
export function toPreviewVersion(previewKey: string): string {
	return Bun.hash(previewKey).toString(36)
}

// the muted color each card's footer prints its counts in
export const CARD_MUTED_COLOR = darkRoast.heroMuted

// how much time a provider photo gets to load before the card gives up on it
const PROVIDER_PHOTO_TIMEOUT_MS = 3000

// the card's palette, taken from the dark theme
const CARD_BACKGROUND = darkRoast.card
const CARD_COLOR = darkRoast.foreground
const CARD_ACCENT = darkRoast.primary

// the image across a card's top, edge to edge like the home page's card, and the padding of the text under it
const CARD_IMAGE_BAND_HEIGHT = 360
const CARD_BODY_PADDING = "28px 64px 44px"

/**
 * The rendered avatar's identity in a card's stored key.
 *
 * A stored upload's avatar key already includes its own random id, and a provider photo's url changes when the photo does,
 * so either one changing is enough to give the preview card a new url.
 */
export function toAvatarIdentity(avatar: PublishedAvatar): string {
	if (!avatar) {
		return "initials"
	}
	return "avatarKey" in avatar ? avatar.avatarKey : avatar.imageUrl
}

/**
 * The card frame drawn around a preview card's rows: satori generates the svg, resvg rasterizes
 * it at the card's own width, so the png comes out at exactly the size the platforms crop to.
 */
export async function toCardPng(rows: CardElement[]): Promise<Uint8Array> {
	return toCardElementPng({ cardElement: toCardFrame(rows, "64px"), width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT })
}

// the card's frame around its rows: the dark card, the brand font, and the padding the card asks for
function toCardFrame(rows: CardElement[], padding: string): CardElement {
	return {
		type: "div",
		props: {
			style: {
				height: "100%",
				width: "100%",
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				backgroundColor: CARD_BACKGROUND,
				color: CARD_COLOR,
				fontFamily: "Architects Daughter",
				padding,
			},
			children: rows,
		},
	}
}

// the image, the title, and the footer of a card that draws its image across its top
type ToImageOverTextCardPngOptions = { imageDataUri: string; title: string; footer: CardElement }

/**
 * Draws a card the way the home page's cards look: the image across the top, edge to edge, then the title beside the
 * brand and the footer on the card under it. Returns the card as png bytes.
 */
export function toImageOverTextCardPng({
	imageDataUri,
	title,
	footer,
}: ToImageOverTextCardPngOptions): Promise<Uint8Array> {
	// the image band at the card's width
	const imageElement: CardElement = {
		type: "img",
		props: { src: imageDataUri, width: PREVIEW_WIDTH, height: CARD_IMAGE_BAND_HEIGHT },
	}

	// the title wraps and stops at two lines with an ellipsis, with the brand at the row's end
	const titleElement: CardElement = {
		type: "div",
		props: { style: { display: "block", lineClamp: 2, fontSize: 54, lineHeight: 1.15, flex: 1 }, children: title },
	}
	const titleRow: CardElement = {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "flex-start", gap: "32px" },
			children: [titleElement, toBrandIcon()],
		},
	}
	const body: CardElement = {
		type: "div",
		props: {
			style: {
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				flex: 1,
				padding: CARD_BODY_PADDING,
			},
			children: [titleRow, footer],
		},
	}
	return toCardElementPng({
		cardElement: toCardFrame([imageElement, body], "0"),
		width: PREVIEW_WIDTH,
		height: PREVIEW_HEIGHT,
	})
}

/**
 * Returns a stored original, cropped from its center to the card's image band, as a data uri that satori can draw.
 */
export async function loadCardImageBandDataUri(originalKey: string): Promise<string> {
	const originalJpeg = await getAttachmentBytes(originalKey)
	const bandJpeg = await toTopicImageCardJpeg(originalJpeg, PREVIEW_WIDTH, CARD_IMAGE_BAND_HEIGHT)
	return toImageDataUri(bandJpeg, "image/jpeg")
}

/**
 * The owner's published image as bytes satori can draw, or null to fall back to their initials.
 * A remote provider photo is fetched here and inlined.
 */
export async function toOwnerImageDataUri(avatar: PublishedAvatar): Promise<string | null> {
	if (!avatar) {
		return null
	}
	try {
		// a stored upload comes from the app's own bucket, and its avatar key names the type to serve it as
		if ("avatarKey" in avatar) {
			const bytes = await getAttachmentBytes(avatar.avatarKey)
			return toImageDataUri(bytes, toAvatarContentType(avatar.avatarKey))
		}
		// a provider photo is somebody else's url, so it is bounded by a timeout and a size before being read
		const response = await fetch(avatar.imageUrl, { signal: AbortSignal.timeout(PROVIDER_PHOTO_TIMEOUT_MS) })
		if (!response.ok) {
			return null
		}
		const bytes = await toAvatarBytes(response)
		if (!bytes) {
			return null
		}
		// what the provider says it sent, falling back to the format a provider photo almost always is
		const contentType = response.headers.get("content-type") ?? "image/jpeg"
		return toImageDataUri(bytes, contentType)
	} catch (error) {
		// an unreadable image draws the initials instead
		console.error("preview avatar load failed", error)
		return null
	}
}

// a response's bytes, or null once it runs past the size an avatar can be
async function toAvatarBytes(response: Response): Promise<Uint8Array | null> {
	if (!response.body) {
		return null
	}
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let byteLength = 0
	// the running total is checked before a chunk is kept, so nothing past the limit is ever held
	while (true) {
		const { done, value } = await reader.read()
		if (done) {
			break
		}
		// past the limit the rest is never asked for, so an endless response cannot keep the render open
		byteLength += value.byteLength
		if (byteLength > MAX_AVATAR_BYTES) {
			await reader.cancel()
			return null
		}
		chunks.push(value)
	}
	// one image, joined back together now that its whole size is known to be within the limit
	return Buffer.concat(chunks)
}

// whose avatar is drawn: their id for the tint, their name for the initials, the image they publish, and the width
type OwnerAvatarOptions = { id: string; name: string; image: string | null; size: number }

/**
 * Returns the image a user or a team publishes at this size, or their initials in their tint if they publish none.
 */
export function toOwnerAvatar({ id, name, image, size }: OwnerAvatarOptions): CardElement {
	return image ? toOwnerPhoto(image, size) : toOwnerInitials(id, name, size)
}

/**
 * The published user image, cropped to fit the same circle the initials draw.
 */
function toOwnerPhoto(ownerImage: string, size: number): CardElement {
	return {
		type: "img",
		props: {
			src: ownerImage,
			width: size,
			height: size,
			style: { borderRadius: size / 2, objectFit: "cover" },
		},
	}
}

/**
 * The default username initials image that the app renders, its letters scaled to the circle.
 */
function toOwnerInitials(userId: string, username: string, size: number): CardElement {
	return {
		type: "div",
		props: {
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: toAvatarTint(userId),
				color: AVATAR_COLOR,
				fontSize: Math.round((size * 3) / 7),
			},
			children: toAvatarInitials(username),
		},
	}
}

/**
 * The brand line in the top left corner of a preview card.
 */
export function toBrandIcon(): CardElement {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "14px", fontSize: 36, color: CARD_ACCENT },
			children: [toMug(), "CarlNotes"],
		},
	}
}

// the coffee mug icon, drawn from the same paths CoffeeMug.tsx renders
function toMug(): CardElement {
	const steamWisps = [11.5, 15, 18.5].map((offset) => ({
		type: "path",
		props: {
			d: `M${offset} 10.5 q-2 -1.6 0 -3.2 q2 -1.6 0 -3.2`,
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

/**
 * A count and its word pluralized if necessary.
 */
export function toCountLabel(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`
}
