// the server's image text render: an element in the React shape that satori lays out as an svg in the app's fonts,
// rasterized by resvg into a png. the share cards, the podcast covers, and the film frames all draw through it

import { renderAsync } from "@resvg/resvg-js"
import satori from "satori"

// one element of the markup, in the React element shape that satori reads
export type CardElement = {
	type: string
	props: { style?: Record<string, unknown>; children?: (CardElement | string)[] | string } & Record<string, unknown>
}

// the element to draw and the pixel size to draw it at
type ToCardElementPngOptions = { cardElement: CardElement; width: number; height: number }

// the fonts, read once at boot. satori takes font bytes.
// Architects Daughter is the brand font, and Karla is the body font at its regular and semibold weights
const FONTS_URL = new URL("./assets/fonts/", import.meta.url)
const architectsDaughterFont = await Bun.file(new URL("ArchitectsDaughter-Regular.ttf", FONTS_URL)).arrayBuffer()
const karlaRegularFont = await Bun.file(new URL("Karla-Regular.ttf", FONTS_URL)).arrayBuffer()
const karlaSemiBoldFont = await Bun.file(new URL("Karla-SemiBold.ttf", FONTS_URL)).arrayBuffer()

// the fonts satori may lay text out in, by the family name that an element's style names
const CARD_FONTS = [
	{ name: "Architects Daughter", data: architectsDaughterFont, weight: 400, style: "normal" },
	{ name: "Karla", data: karlaRegularFont, weight: 400, style: "normal" },
	{ name: "Karla", data: karlaSemiBoldFont, weight: 600, style: "normal" },
] satisfies Parameters<typeof satori>[1]["fonts"]

/**
 * Draws an element with satori and returns it as a png at the given size, rasterized by resvg.
 */
export async function toCardElementPng({ cardElement, width, height }: ToCardElementPngOptions): Promise<Uint8Array> {
	// satori lays the element out as an svg in the app's fonts
	const cardSvg = await satori(cardElement as Parameters<typeof satori>[0], { width, height, fonts: CARD_FONTS })

	// renderAsync rasterizes on a worker thread, so a burst of renders never stalls the event loop
	const renderedImage = await renderAsync(cardSvg, { fitTo: { mode: "width", value: width } })
	return renderedImage.asPng()
}

/**
 * Returns an image's bytes as a data uri that satori can draw.
 */
export function toImageDataUri(bytes: Uint8Array, contentType: string): string {
	return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`
}
