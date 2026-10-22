// every text token reads at the WCAG AA body text ratio, 4.5:1, on each surface the web app puts it on, in both modes
import { expect, test } from "bun:test"
import { type ColorName, colorModes, colors, toColorChannels } from "./colors"

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
