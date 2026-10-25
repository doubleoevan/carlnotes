// every text token reads at the WCAG AA body text ratio, 4.5:1, on each surface the web app puts it on, in both modes
import { expect, test } from "bun:test"
import { type ColorName, colorModes, colors, toColorChannels } from "./colors"
import { FIELD_CLASS } from "./field"

// the body text ratio WCAG 2 AA asks for
const MINIMUM_CONTRAST_RATIO = 4.5

// the page and the fills that sit on it: a card, a popover, a subtable, the muted fill, a hovered row, and a chat bubble
const PAGE_SURFACES: ColorName[] = ["background", "card", "popover", "sunken", "muted", "accent", "bubble"]

// each text token, and the surfaces the app sets it on
const TEXT_ON_SURFACES: [ColorName, ColorName[]][] = [
	// text that sits on the page and every fill on it
	["foreground", PAGE_SURFACES],
	["mutedForeground", PAGE_SURFACES],
	["link", PAGE_SURFACES],
	["destructive", PAGE_SURFACES],
	["badge", PAGE_SURFACES],
	// text on its own fill, and secondary text where a card or a popover sets it
	["cardForeground", ["card"]],
	["popoverForeground", ["popover"]],
	["secondaryForeground", ["secondary", "card", "popover"]],
	["accentForeground", ["accent"]],
	["primaryForeground", ["primary"]],
	// text on the hero band
	["heroForeground", ["hero"]],
	["heroMuted", ["hero"]],
	["heroAccent", ["hero"]],
]

// each pair in each mode passes the ratio
for (const mode of colorModes) {
	for (const [textName, surfaceNames] of TEXT_ON_SURFACES) {
		for (const surfaceName of surfaceNames) {
			// one test per pair, so a failure names the pair
			test(`${mode} ${textName} on ${surfaceName} reads at 4.5:1 or more`, () => {
				const ratio = toContrastRatio(colors[textName][mode], colors[surfaceName][mode])
				expect(ratio).toBeGreaterThanOrEqual(MINIMUM_CONTRAST_RATIO)
			})
		}
	}
}

// the field fill: the input color at the opacity FIELD_CLASS names, over a card and a popover, under a value and a
// placeholder
const FIELD_FILL_BASES: ColorName[] = ["card", "popover"]
const FIELD_FILL_TEXT: ColorName[] = ["foreground", "mutedForeground"]
const fieldFillOpacity = Number(/bg-input\/(\d+)/.exec(FIELD_CLASS)?.[1]) / 100

// the fill's opacity reads out of the class
test("FIELD_CLASS names the fill's opacity", () => {
	expect(fieldFillOpacity).toBeGreaterThan(0)
})

// each text token on the field fill over each base passes the ratio, in each mode
for (const mode of colorModes) {
	for (const textName of FIELD_FILL_TEXT) {
		for (const baseName of FIELD_FILL_BASES) {
			test(`${mode} ${textName} on the field fill over ${baseName} reads at 4.5:1 or more`, () => {
				const fieldFillHex = toBlendedHex({
					topHex: colors.input[mode],
					bottomHex: colors[baseName][mode],
					alpha: fieldFillOpacity,
				})
				expect(toContrastRatio(colors[textName][mode], fieldFillHex)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST_RATIO)
			})
		}
	}
}

// the hex color of one color at an alpha over another, channel by channel
function toBlendedHex({ topHex, bottomHex, alpha }: { topHex: string; bottomHex: string; alpha: number }): string {
	const topChannels = toColorChannels(topHex).channels
	const bottomChannels = toColorChannels(bottomHex).channels
	const blendedChannels = topChannels.map((topChannel, i) =>
		Math.round(topChannel * alpha + (bottomChannels[i] ?? 0) * (1 - alpha)),
	)
	return `#${blendedChannels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

// the WCAG contrast ratio of two six-digit hex colors
function toContrastRatio(firstHex: string, secondHex: string): number {
	const [lighter = 0, darker = 0] = [toRelativeLuminance(firstHex), toRelativeLuminance(secondHex)].sort(
		(a, b) => b - a,
	)
	return (lighter + 0.05) / (darker + 0.05)
}

// a hex color's WCAG relative luminance
function toRelativeLuminance(hex: string): number {
	// each channel from 0 to 1, made linear
	const [red = 0, green = 0, blue = 0] = toColorChannels(hex)
		.channels.map((channel) => channel / 255)
		.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
