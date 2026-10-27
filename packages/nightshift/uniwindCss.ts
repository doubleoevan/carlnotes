// the mobile app's uniwind.css, written from the source. it holds the radius steps, the raised shadow, and every mapped
// color name with each mode's resolved value
import { type ColorMode, type ColorName, colors, toColorChannels } from "./colors"
import { toRaisedShadowUtilityCss } from "./elevation"
import { type RadiusStep, radiusSteps, toRadiusPixels } from "./radius"
import { extraThemeColorNames, shadcnThemeColorNames, toKebabName } from "./theme"
import { fontFamilies } from "./typography"

// the comment at the top of the file, which names the writer
const FILE_HEADER = `/* the mobile design tokens, written by scripts/write-nightshift-tokens.ts from this package's TypeScript. change a
   token in the source and run bun run nightshift:write, never this file */`

/**
 * Returns uniwind.css as the token writer writes it: the radius steps in a @theme block, the raised shadow's utility,
 * and each mode's resolved color values in its own @variant block.
 */
export function toUniwindCss(): string {
	return `${[FILE_HEADER, toRadiusThemeBlock(), toRaisedShadowUtilityCss(), toColorModesBlock()].join("\n\n")}\n`
}

// the @theme block: each radius step resolved to pixels. a native app has no root font size for the web's calc form
function toRadiusThemeBlock(): string {
	const radiusLines = (Object.keys(radiusSteps) as RadiusStep[]).map(
		(radiusStep) => `\t--radius-${radiusStep}: ${toRadiusPixels(radiusStep)}px;`,
	)
	return [
		"@theme {",
		`\t--font-sans: "${fontFamilies.sans.name}";`,
		`\t--font-display: "${fontFamilies.display.name}";`,
		...radiusLines,
		"}",
	].join("\n")
}

// the @layer theme block: one @variant block per mode under :root. each block defines every mapped name
function toColorModesBlock(): string {
	const variantBlocks = ["light", "dark"].map((mode) => toVariantBlock(mode as ColorMode))
	return ["@layer theme {", "\t:root {", variantBlocks.join("\n\n"), "\t}", "}"].join("\n")
}

// one mode's @variant block: the shadcn semantic names, then the CarlNotes extras. every value is resolved
function toVariantBlock(mode: ColorMode): string {
	const colorLines = [...shadcnThemeColorNames, ...extraThemeColorNames].map((colorName) =>
		toColorLine({ colorName, mode }),
	)
	return [`\t\t@variant ${mode} {`, ...colorLines, "\t\t}"].join("\n")
}

// one color variable's options: the mapped name, and the mode whose value it writes
type ToColorLineOptions = { colorName: ColorName; mode: ColorMode }

// one color variable. the check throws on any form React Native cannot read
function toColorLine({ colorName, mode }: ToColorLineOptions): string {
	const colorValue = colors[colorName][mode]
	toColorChannels(colorValue)
	return `\t\t\t--color-${toKebabName(colorName)}: ${colorValue};`
}
