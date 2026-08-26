// the shared link-preview card image methods
import { renderAsync } from "@resvg/resvg-js"
import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@shared/avatars"
import satori from "satori"
import { getAttachmentBytes } from "../../worker"
import { MAX_AVATAR_BYTES, type PublishedAvatar, toAvatarContentType } from "../avatars"

// what every platform crops preview images to. 1200x630 is the size X, Slack, and LinkedIn all expect
export const PREVIEW_WIDTH = 1200
export const PREVIEW_HEIGHT = 630

// bump this when the card's design changes. Slack and X cache preview images hard and ignore cache headers.
export const PREVIEW_TEMPLATE_VERSION = "v3"

// the muted color each card's footer prints its counts in
export const CARD_MUTED_COLOR = "#b9a68e"

// how much time a provider photo gets to load before the card gives up on it
const PROVIDER_PHOTO_TIMEOUT_MS = 3000

// the brand font, read once at boot. Satori takes font bytes, not a font-family name or a stylesheet
const displayFont = await Bun.file(new URL("./fonts/ArchitectsDaughter-Regular.ttf", import.meta.url)).arrayBuffer()

// the rest of the card's palette, taken from the dark theme
const CARD_BACKGROUND = "#2a1f14"
const CARD_COLOR = "#f0e6d6"
const CARD_ACCENT = "#f09050"

// one node of the card's markup tree, which is the shape satori reads instead of React elements
export type CardNode = {
	type: string
	props: { style?: Record<string, unknown>; children?: (CardNode | string)[] | string } & Record<string, unknown>
}

/**
 * The rendered avatar's identity in a card's stored key.
 *
 * A stored upload's avatar key already includes its own stamp, and a provider photo's url changes when the photo does,
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
export async function toCardPng(rows: CardNode[]): Promise<Uint8Array> {
	const frame: CardNode = {
		type: "div",
		props: {
			style: {
				height: "100%",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				backgroundColor: CARD_BACKGROUND,
				color: CARD_COLOR,
				fontFamily: "Architects Daughter",
				padding: "64px",
			},
			children: rows,
		},
	}
	// the svg exported as a png at the exact platform crop size
	const previewSvg = await satori(frame as Parameters<typeof satori>[0], {
		width: PREVIEW_WIDTH,
		height: PREVIEW_HEIGHT,
		fonts: [{ name: "Architects Daughter", data: displayFont, weight: 400, style: "normal" }],
	})
	// renderAsync rasterizes on a worker thread, so a burst of preview fetches never stalls the event loop
	const renderedImage = await renderAsync(previewSvg, { fitTo: { mode: "width", value: PREVIEW_WIDTH } })
	return renderedImage.asPng()
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
			return `data:${toAvatarContentType(avatar.avatarKey)};base64,${Buffer.from(bytes).toString("base64")}`
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
		return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
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

/**
 * The published user image, cropped to fit the same circle the initials draw.
 */
export function toOwnerPhoto(ownerImage: string, size: number): CardNode {
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
export function toOwnerInitials(userId: string, username: string, size: number): CardNode {
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
export function toBrandIcon(): CardNode {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "14px", fontSize: 36, color: CARD_ACCENT },
			children: [toMug(), "CarlNotes"],
		},
	}
}

// the coffee mug icon, drawn from the same paths CoffeeMug.tsx renders
function toMug(): CardNode {
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
