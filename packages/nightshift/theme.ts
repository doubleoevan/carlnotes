// the color names the web app's Tailwind theme maps onto the palette, as --color-<name> utilities
import type { ColorName } from "./colors"

// the modes the dark class switches the page between
export type { ColorMode } from "./colors"

/** The semantic names shadcn's components read. The theme lists them in this order. */
export const shadcnThemeColorNames: ColorName[] = [
	"background",
	"sunken",
	"foreground",
	"card",
	"cardForeground",
	"popover",
	"popoverForeground",
	"primary",
	"primaryForeground",
	"secondary",
	"secondaryForeground",
	"muted",
	"bubble",
	"mutedForeground",
	"accent",
	"accentForeground",
	"destructive",
	"border",
	"input",
	"ring",
]

/**
 * The CarlNotes extras: the hero band, the "# new" badge, links and expanders, the dashed row separators, and the
 * budget's segments.
 */
export const extraThemeColorNames: ColorName[] = [
	"hero",
	"heroForeground",
	"heroMuted",
	"heroAccent",
	"badge",
	"link",
	"separator",
	"separatorStrong",
	"separatorSunken",
	"spendChat",
	"spendPodcastEpisode",
]

// the localStorage key that the saved theme lives under, which the web app and the api's own pages read
export const THEME_STORAGE_KEY = "theme"

// the script that sets the dark class on the html element before first paint. a theme saved in localStorage wins over
// the OS setting
export const DARK_CLASS_SCRIPT = `try {
  const savedTheme = localStorage.getItem("${THEME_STORAGE_KEY}")
  const isDark = savedTheme ? savedTheme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  document.documentElement.classList.toggle("dark", isDark)
} catch {}`

/**
 * Returns a token name as its CSS custom property name, without the leading dashes.
 */
export function toKebabName(tokenName: string): string {
	return tokenName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/**
 * Returns a color token's runtime palette variable, such as var(--muted-foreground), so styles follow the theme.
 * Tailwind's inline --color aliases are compiled into utilities and need not exist in the rendered CSS.
 */
export function toColorCssVariable(colorName: ColorName): string {
	return `var(--${toKebabName(colorName)})`
}
