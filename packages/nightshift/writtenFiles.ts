// the files the token writer writes from the source, by their path inside this package
import { colorModes } from "./colors"
import { toFigmaTokens } from "./figmaTokens"
import { toTokensCss } from "./tokensCss"
import { toUniwindCss } from "./uniwindCss"

/**
 * Returns each written file's text by its path inside the package: tokens.css, uniwind.css, and one Figma file per
 * mode.
 */
export function toWrittenFiles(): Record<string, string> {
	// the Figma file of each mode
	const figmaFiles = colorModes.map((mode) => [
		`figma/${mode}.tokens.json`,
		`${JSON.stringify(toFigmaTokens(mode), null, "\t")}\n`,
	])
	return { "tokens.css": toTokensCss(), "uniwind.css": toUniwindCss(), ...Object.fromEntries(figmaFiles) }
}
