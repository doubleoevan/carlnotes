// the topic's link-preview card that a pasted Topic url renders as: JSX to SVG with Satori, SVG to PNG with resvg.
// Satori cannot use system fonts, so the font is added beside this file and passed in as bytes
import { Resvg } from "@resvg/resvg-js"
import { AVATAR_INK, toAvatarInitials, toAvatarTint } from "@shared/avatars"
import satori from "satori"

// what every platform crops preview images to. 1200x630 is the size X, Slack, and LinkedIn all expect
export const PREVIEW_WIDTH = 1200
export const PREVIEW_HEIGHT = 630

// bump this when the card's design changes. Slack and X cache preview images hard and ignore cache headers.
export const PREVIEW_TEMPLATE_VERSION = "v2"

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

// what the card says about a Topic
export type TopicPreview = {
	topicId: string
	title: string
	ownerUserId: string
	ownerUsername: string
	keptCount: number
	sourceCount: number
}

/**
 * The stored object key for a card.
 *
 * It holds the template version and a hash of everything drawn, so a retitled Topic or a redesigned card both land on a new preview url.
 * The social platforms never re-fetch a url they have seen, so the url has to change instead.
 */
export function toPreviewKey(card: TopicPreview): string {
	const drawn = `${card.title}|${card.ownerUsername}|${card.keptCount}|${card.sourceCount}`
	return `og/${PREVIEW_TEMPLATE_VERSION}/${card.topicId}/${Bun.hash(drawn).toString(36)}.png`
}

/**
 * Render a Topic's card to PNG bytes.
 */
export async function toPreviewPng(card: TopicPreview): Promise<Uint8Array> {
	// satori generates the topic specific svg
	const svg = await satori(toPreviewMarkup(card) as Parameters<typeof satori>[0], {
		width: PREVIEW_WIDTH,
		height: PREVIEW_HEIGHT,
		fonts: [{ name: "Architects Daughter", data: displayFont, weight: 400, style: "normal" }],
	})
	// resvg rasterizes at the card's own width, so the png comes out at exactly the size the platforms crop to
	return new Resvg(svg, { fitTo: { mode: "width", value: PREVIEW_WIDTH } }).render().asPng()
}

// the card's layout. Satori takes React-shaped objects instead of components, and supports a flexbox subset
function toPreviewMarkup(card: TopicPreview): CardNode {
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
			children: [toWordmark(), toTitle(card.title), toFooter(card)],
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
function toFooter(card: TopicPreview): CardNode {
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 },
			children: [
				toTopicOwner(card),
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

// the same username initials image that the app renders
function toTopicOwner(card: TopicPreview): CardNode {
	const initials = toAvatarInitials(card.ownerUsername)
	return {
		type: "div",
		props: {
			style: { display: "flex", alignItems: "center", gap: "16px" },
			children: [
				{
					type: "div",
					props: {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: 56,
							height: 56,
							borderRadius: 28,
							backgroundColor: toAvatarTint(card.ownerUserId),
							color: AVATAR_INK,
							fontSize: 24,
						},
						children: initials,
					},
				},
				{ type: "div", props: { style: { display: "flex" }, children: card.ownerUsername } },
			],
		},
	}
}
