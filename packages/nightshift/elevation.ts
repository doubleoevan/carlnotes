// the raised shadow, the one elevation every raised surface takes, as its two shadows and the shadow-raised utility,
// and a card link's glow in each mode, the ring and halo in the primary color under a hover, a focus, or a press
import { type ColorMode, colors, toColorChannels } from "./colors"

/** One shadow: its offsets, blur, and spread in pixels, and its color. */
export type Shadow = {
	offsetXPixels: number
	offsetYPixels: number
	blurPixels: number
	spreadPixels: number
	color: string
}

/**
 * The raised shadow's two shadows: a short close one and a long soft one pulled in by its negative spread.
 */
export const raisedShadows: Shadow[] = [
	{ offsetXPixels: 0, offsetYPixels: 2, blurPixels: 5, spreadPixels: 0, color: "rgba(0, 0, 0, 0.2)" },
	{ offsetXPixels: 0, offsetYPixels: 8, blurPixels: 15, spreadPixels: -6, color: "rgba(0, 0, 0, 0.34)" },
]

/** The name of the utility both apps draw the raised shadow with. */
export const RAISED_SHADOW_UTILITY_NAME = "shadow-raised"

// the custom property each mode sets to its card glow, which both stylesheets hold
const CARD_GLOW_SHADOW_PROPERTY = "--card-glow-shadow"

/** The name of the utility the mobile app draws a pressed card's glow with. */
export const CARD_GLOW_SHADOW_UTILITY_NAME = "shadow-card-glow"

// one shadow of the card glow: its blur and spread in pixels, and its color, the primary color mixed at its share
// with transparent or with black
type CardGlowShadow = { blurPixels: number; spreadPixels: number; mix: "transparent" | "black"; primaryShare: number }

// each mode's card glow: a faint ring in the primary color and a soft primary halo. the light theme's lighter page
// takes a wider, deeper halo
const cardGlowShadows: Record<ColorMode, CardGlowShadow[]> = {
	light: [
		{ blurPixels: 0, spreadPixels: 1, mix: "transparent", primaryShare: 0.35 },
		{ blurPixels: 36, spreadPixels: 6, mix: "black", primaryShare: 0.88 },
	],
	dark: [
		{ blurPixels: 0, spreadPixels: 1, mix: "transparent", primaryShare: 0.55 },
		{ blurPixels: 28, spreadPixels: -4, mix: "transparent", primaryShare: 0.65 },
	],
}

/**
 * Returns the raised shadow as a CSS @utility block.
 */
export function toRaisedShadowUtilityCss(): string {
	return [
		"/* the raised shadow, the one elevation under every raised surface */",
		`@utility ${RAISED_SHADOW_UTILITY_NAME} {`,
		`\tbox-shadow: ${toShadowsCssValue(raisedShadows)};`,
		"}",
	].join("\n")
}

/**
 * Returns a mode's card glow as its custom property's line, without the indent. The web's line mixes the live primary
 * color, so the glow follows a primary color set later, and the mobile line holds each mix resolved to hex.
 */
export function toCardGlowPropertyLine({ mode, isResolved }: { mode: ColorMode; isResolved: boolean }): string {
	// each shadow centered under the card, in the color form the stylesheet reads
	const shadows = cardGlowShadows[mode].map((cardGlowShadow) => ({
		offsetXPixels: 0,
		offsetYPixels: 0,
		blurPixels: cardGlowShadow.blurPixels,
		spreadPixels: cardGlowShadow.spreadPixels,
		color: isResolved ? toResolvedGlowColor({ cardGlowShadow, mode }) : toMixedGlowColor(cardGlowShadow),
	}))
	return `${CARD_GLOW_SHADOW_PROPERTY}: ${toShadowsCssValue(shadows)};`
}

/**
 * Returns the card glow's @utility block, which reads the mode's custom property.
 */
export function toCardGlowUtilityCss(): string {
	return [
		"/* a card link's glow, read from the mode's custom property */",
		`@utility ${CARD_GLOW_SHADOW_UTILITY_NAME} {`,
		`\tbox-shadow: var(${CARD_GLOW_SHADOW_PROPERTY});`,
		"}",
	].join("\n")
}

// shadows as one CSS value, in order
function toShadowsCssValue(shadows: Shadow[]): string {
	return shadows.map(toShadowCssValue).join(", ")
}

// one shadow as CSS: the offsets, the blur, and the spread in pixels, and the color
function toShadowCssValue(shadow: Shadow): string {
	return `${shadow.offsetXPixels}px ${shadow.offsetYPixels}px ${shadow.blurPixels}px ${shadow.spreadPixels}px ${shadow.color}`
}

// a card glow color as CSS that mixes the live primary color
function toMixedGlowColor({ mix, primaryShare }: CardGlowShadow): string {
	return `color-mix(in oklab, var(--primary) ${Math.round(primaryShare * 100)}%, ${mix})`
}

// a card glow color resolved from the mode's primary color, as eight-digit hex, which holds no bare number for the
// mobile shadow parser to add px to. a mix with transparent keeps the color at the share's alpha. a mix with black
// in oklab scales oklab's three values by the share
function toResolvedGlowColor({ cardGlowShadow, mode }: { cardGlowShadow: CardGlowShadow; mode: ColorMode }): string {
	const channels = toColorChannels(colors.primary[mode]).channels
	if (cardGlowShadow.mix === "transparent") {
		return `${toHexColor(channels)}${toHexByte(Math.round(cardGlowShadow.primaryShare * 255))}`
	}
	// a mix with black scales each linear channel by the share's cube
	const linearScale = cardGlowShadow.primaryShare ** 3
	return toHexColor(channels.map((channel) => toEncodedChannel(toLinearChannel(channel) * linearScale)))
}

// red, green, and blue channels from 0 to 255 as a six-digit hex color
function toHexColor(channels: number[]): string {
	return `#${channels.map(toHexByte).join("")}`
}

// one byte from 0 to 255 as two hex digits
function toHexByte(byte: number): string {
	return byte.toString(16).padStart(2, "0")
}

// an sRGB channel from 0 to 255 as linear light from 0 to 1
function toLinearChannel(channel: number): number {
	const encoded = channel / 255
	return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4
}

// linear light from 0 to 1 as an sRGB channel from 0 to 255
function toEncodedChannel(linear: number): number {
	const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
	return Math.round(encoded * 255)
}
