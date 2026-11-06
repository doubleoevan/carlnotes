// the MCP views' mcpViewTokens.css, written from the source. each Nightshift variable a host's style covers reads the
// host's variable, with its Latte or Dark roast value as the fallback
import { type ColorMode, type ColorName, colors } from "./colors"
import { BASE_RADIUS_REM } from "./radius"
import { toKebabName } from "./theme"

// the comment at the top of the file, which names the writer
const FILE_HEADER = `/* the MCP views' theme, written by scripts/write-nightshift-tokens.ts from this package's TypeScript. change a
   token in the source and run bun run nightshift:write, never this file */`

// the MCP Apps host variable each Nightshift color reads
const HOST_COLOR_VARIABLES = {
	background: "--color-background-primary",
	sunken: "--color-background-secondary",
	foreground: "--color-text-primary",
	card: "--color-background-primary",
	cardForeground: "--color-text-primary",
	popover: "--color-background-primary",
	popoverForeground: "--color-text-primary",
	primary: "--color-background-inverse",
	primaryForeground: "--color-text-inverse",
	secondary: "--color-background-secondary",
	secondaryForeground: "--color-text-secondary",
	muted: "--color-background-secondary",
	mutedForeground: "--color-text-secondary",
	bubble: "--color-background-secondary",
	accent: "--color-background-tertiary",
	accentForeground: "--color-text-secondary",
	destructive: "--color-text-danger",
	border: "--color-border-primary",
	input: "--color-border-primary",
	ring: "--color-ring-primary",
	link: "--color-text-info",
	separator: "--color-border-secondary",
	separatorStrong: "--color-border-primary",
	separatorSunken: "--color-border-secondary",
} satisfies Partial<Record<ColorName, string>>

// the host variable Nightshift's base radius reads
const HOST_RADIUS_VARIABLE = "--border-radius-md"

/**
 * Returns mcpViewTokens.css as the token writer writes it.
 */
export function toMcpViewTokensCss(): string {
	return `${[FILE_HEADER, toPaletteBlock("light"), toPaletteBlock("dark")].join("\n\n")}\n`
}

// one mode's custom properties, under the selector tokens.css gives that mode
function toPaletteBlock(mode: ColorMode): string {
	// each color reads its host variable, then that mode's own value
	const colorLines = Object.entries(HOST_COLOR_VARIABLES).map(
		([colorName, hostVariable]) =>
			`\t--${toKebabName(colorName)}: var(${hostVariable}, ${colors[colorName as ColorName][mode]});`,
	)

	// the base radius is the same in both modes, so only :root sets it
	const isLight = mode === "light"
	const radiusLines = isLight ? [`\t--radius: var(${HOST_RADIUS_VARIABLE}, ${BASE_RADIUS_REM}rem);`] : []
	return [isLight ? ":root {" : ".dark {", ...radiusLines, ...colorLines, "}"].join("\n")
}
