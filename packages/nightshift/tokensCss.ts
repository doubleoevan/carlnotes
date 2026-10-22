// the web app's tokens.css, written from the source: the Tailwind theme, Latte on :root, and Dark roast under .dark
import { type ColorMode, type ColorName, colors } from "./colors"
import { BASE_RADIUS_REM, type RadiusStep, radiusSteps, toRadiusCssValue } from "./radius"
import { extraThemeColorNames, shadcnThemeColorNames, toKebabName } from "./theme"
import { fontFamilies } from "./typography"

// the comment at the top of the file, which names the writer
const FILE_HEADER = `/* the design tokens, written by scripts/write-nightshift-tokens.ts from this package's TypeScript. change a token
   in the source and run bun run nightshift:write, never this file */`

/**
 * Returns tokens.css as the token writer writes it.
 */
export function toTokensCss(): string {
	return `${[FILE_HEADER, toThemeBlock(), toPaletteBlock("light"), toPaletteBlock("dark")].join("\n\n")}\n`
}

// the @theme inline block: the fonts, the color utilities, and the radius scale
function toThemeBlock(): string {
	return [
		"@theme inline {",
		"\t/* fonts: Architects Daughter for display, Karla for body */",
		`\t--font-sans: ${fontFamilies.sans.stack};`,
		`\t--font-display: ${fontFamilies.display.stack};`,
		"\t/* shadcn semantic tokens, mapped to the CarlNotes palette below */",
		...shadcnThemeColorNames.map(toThemeColorLine),
		"\t/* CarlNotes extras: the hero band, the badge, links and expanders, row separators, and the budget's segments */",
		...extraThemeColorNames.map(toThemeColorLine),
		...(Object.keys(radiusSteps) as RadiusStep[]).map(toRadiusLine),
		"}",
	].join("\n")
}

// one color utility, read from the palette's custom property
function toThemeColorLine(colorName: ColorName): string {
	const kebabName = toKebabName(colorName)
	return `\t--color-${kebabName}: var(--${kebabName});`
}

// one radius step's custom property
function toRadiusLine(radiusStep: RadiusStep): string {
	return `\t--radius-${radiusStep}: ${toRadiusCssValue(radiusStep)};`
}

// one mode's custom properties: Latte on :root with each token's description and the base radius, and Dark roast
// under .dark
function toPaletteBlock(mode: ColorMode): string {
	// light mode describes each token once, beside its value
	const isLight = mode === "light"
	const colorLines = Object.entries(colors).flatMap(([colorName, colorToken]) => {
		const valueLine = `\t--${toKebabName(colorName)}: ${colorToken[mode]};`
		return isLight ? [`\t/* ${colorToken.description} */`, valueLine] : [valueLine]
	})

	// the block, under its mode's selector
	const header = isLight ? "/* Latte, light mode */\n:root {" : "/* Dark roast, dark mode */\n.dark {"
	const radiusLines = isLight ? [`\t--radius: ${BASE_RADIUS_REM}rem;`] : []
	return [header, ...radiusLines, ...colorLines, "}"].join("\n")
}
