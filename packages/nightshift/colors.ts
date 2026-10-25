// every CarlNotes color token, each with its Latte value for light mode and its Dark roast value for dark mode

/** One color token: its light value, its dark value, and what it colors. */
export type ColorToken = { light: string; dark: string; description: string }

/** The modes of the palette. */
export const colorModes = ["light", "dark"] as const

/** A mode of the palette. */
export type ColorMode = (typeof colorModes)[number]

/**
 * The color tokens. tokens.css and the Figma files list them in this order. A value is a hex color, or an rgba color
 * for a token with alpha.
 */
export const colors = {
	background: { light: "#e2d8c4", dark: "#584532", description: "the page. in dark mode it sits a step lighter" },
	sunken: {
		light: "#e2d8c4",
		dark: "#241a10",
		description: "the inset a subtable sits on, quieter than the card holding it. the page's color in light mode",
	},
	foreground: { light: "#332a22", dark: "#f0e6d6", description: "text on the page" },
	card: { light: "#fffdf9", dark: "#302417", description: "a raised surface. in dark mode it sits a step darker" },
	cardForeground: { light: "#332a22", dark: "#f0e6d6", description: "text on a card" },
	popover: { light: "#fffdf9", dark: "#302417", description: "a popover or a menu" },
	popoverForeground: { light: "#332a22", dark: "#f0e6d6", description: "text in a popover" },
	primary: {
		light: "#d9974a",
		dark: "#f09050",
		description: "the highlight color, on a primary button and a focus ring",
	},
	primaryForeground: { light: "#2a1c0f", dark: "#1a1511", description: "text on the highlight color" },
	secondary: { light: "#f4eee2", dark: "#75593e", description: "a quiet fill, and in dark mode a small badge's fill" },
	secondaryForeground: {
		light: "#75604a",
		dark: "#eadfc6",
		description: "text on the quiet fill. the dark pair clears the 4.5:1 body text ratio",
	},
	muted: { light: "#efe6d8", dark: "#54422f", description: "a muted fill" },
	mutedForeground: {
		light: "#705a40",
		dark: "#c6b898",
		description: "muted text, at 4.5:1 or more on the page, a card, a subtable, a muted fill, and a hovered row",
	},
	bubble: { light: "#e2d8c4", dark: "#584532", description: "the other party's chat bubble" },
	accent: { light: "#e9dcc8", dark: "#584531", description: "a hovered row or option" },
	accentForeground: { light: "#705a40", dark: "#c9ba99", description: "text on a hovered row or option" },
	destructive: {
		light: "#a7362f",
		dark: "#ffa08b",
		description: "a destructive action, and error text on the page or a card. coral in dark mode, to read on the page",
	},
	border: { light: "#dcccb6", dark: "#69553f", description: "a border" },
	input: {
		light: "#a68d64",
		dark: "#8a7152",
		description: "a field's border, at 3:1 or more on a card and a popover, and at 30% the field's fill, in both modes",
	},
	ring: { light: "#d9974a", dark: "#f09050", description: "a focus ring" },
	hero: { light: "#3b2a1d", dark: "#0f0c09", description: "the hero band, which stays dark in both modes" },
	heroForeground: { light: "#f3e9db", dark: "#f4ebdc", description: "text on the hero band" },
	heroMuted: { light: "#b59c81", dark: "#b3a48c", description: "muted text on the hero band" },
	heroAccent: {
		light: "#f09050",
		dark: "#f09050",
		description: "the hero band's highlight text, the same orange in both",
	},
	badge: {
		light: "#805429",
		dark: "#f3a774",
		description: 'the "# new" count beside a topic, at 4.5:1 or more on the page and every fill on it',
	},
	link: {
		light: "#8f4c17",
		dark: "#ffa367",
		description: "a link, an expander, or highlight-colored text, at 4.5:1 or more on every surface it sits on",
	},
	separator: { light: "#dcccb6", dark: "#614e39", description: "the quiet dashes inside cards and popovers" },
	separatorStrong: {
		light: "#c9b28b",
		dark: "#7b6449",
		description: "the stronger cut between rows on the page itself",
	},
	separatorSunken: {
		light: "#a68d64",
		dark: "#69553f",
		description: "the rules inside a subtable, dark enough to show on the sunken fill",
	},
	ringLine: {
		light: "rgba(120, 96, 72, 0.18)",
		dark: "rgba(201, 186, 153, 0.18)",
		description: "the steam rings behind the feed",
	},
	spendChat: {
		light: "#6b4a26",
		dark: "#f0e6d6",
		description: "the budget's chat segment, espresso in light and cream in dark, against the orange scan segment",
	},
	spendPodcastEpisode: {
		light: "#a8703a",
		dark: "#c99a5b",
		description: "the budget's podcast episode segment, a brown between the scan and chat segments",
	},
} satisfies Record<string, ColorToken>

/** A color token's name. */
export type ColorName = keyof typeof colors

/** Each color token's value in one mode, by name. */
export type Palette = Record<ColorName, string>

// every color token's value in one mode
function toPalette(mode: ColorMode): Palette {
	return Object.fromEntries(
		Object.entries(colors).map(([colorName, colorToken]) => [colorName, colorToken[mode]]),
	) as Palette
}

// the light palette, Latte, and the dark palette, Dark roast
export const latte = toPalette("light")
export const darkRoast = toPalette("dark")

// a six-digit hex color, or an rgba color with its alpha
const HEX_COLOR_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const RGBA_COLOR_PATTERN = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/

/**
 * Returns a six-digit hex or an rgba color's red, green, and blue channels from 0 to 255, and its alpha. Throws an
 * error for any other form.
 */
export function toColorChannels(colorValue: string): { channels: [number, number, number]; alpha: number } {
	// the channel texts of either form
	const hexMatch = HEX_COLOR_PATTERN.exec(colorValue)
	const rgbaMatch = RGBA_COLOR_PATTERN.exec(colorValue)
	const channelTexts = hexMatch ? hexMatch.slice(1, 4) : rgbaMatch?.slice(1, 4)
	if (!channelTexts) {
		throw new Error(`the color ${colorValue} is neither a six-digit hex nor an rgba value`)
	}

	// the channels as numbers, and the alpha, which is 1 for a hex color
	const [red = 0, green = 0, blue = 0] = channelTexts.map((channelText) =>
		hexMatch ? Number.parseInt(channelText, 16) : Number(channelText),
	)
	const alpha = rgbaMatch ? Number(rgbaMatch[4]) : 1

	// an rgba channel past 255 or an alpha past 1 is no color
	if ([red, green, blue].some((channel) => channel > 255) || !(alpha >= 0 && alpha <= 1)) {
		throw new Error(`the color ${colorValue} has a channel or an alpha out of range`)
	}
	return { channels: [red, green, blue], alpha }
}
