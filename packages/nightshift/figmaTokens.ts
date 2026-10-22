// one mode's tokens as Design Tokens Community Group format 1.0 JSON, the format Figma's variable import reads. each
// mode is one file, and both files hold the same names, so Figma reads them as two modes of one collection
import { type ColorMode, colors, toColorChannels } from "./colors"
import { type RadiusStep, radiusSteps, toRadiusPixels } from "./radius"
import { fontFamilies, type TypeRole, typeRoles } from "./typography"
import { toPixels } from "./units"

// a color as the format writes it: its sRGB components from 0 to 1, its alpha, and its six-digit hex
type FigmaColorValue = { colorSpace: "srgb"; components: [number, number, number]; alpha: number; hex: string }

// one token, and a group of tokens or groups
type FigmaToken = { $type: string; $value: unknown; $description?: string }
type FigmaGroup = { [name: string]: FigmaToken | FigmaGroup }

/**
 * Returns one mode's colors, radius steps, font families, and type roles as a Design Tokens group.
 */
export function toFigmaTokens(mode: ColorMode): FigmaGroup {
	// each color in this mode
	const colorTokens = Object.fromEntries(
		Object.entries(colors).map(([colorName, colorToken]) => [
			colorName,
			{ $type: "color", $value: toFigmaColorValue(colorToken[mode]), $description: colorToken.description },
		]),
	)

	// the radius steps and the font families
	const radiusTokens = Object.fromEntries(
		(Object.keys(radiusSteps) as RadiusStep[]).map((radiusStep) => [
			radiusStep,
			toPixelToken(toRadiusPixels(radiusStep)),
		]),
	)
	const fontFamilyTokens = Object.fromEntries(
		Object.entries(fontFamilies).map(([fontFamilyName, fontFamily]) => [
			fontFamilyName,
			{ $type: "fontFamily", $value: fontFamily.name, $description: fontFamily.description },
		]),
	)

	// each type role as single-value tokens, because a Figma variable holds one value
	const typeRoleTokens = Object.fromEntries(
		Object.entries(typeRoles).map(([typeRoleName, typeRole]: [string, TypeRole]) => {
			const fontSizePixels = toPixels(typeRole.fontSizeRem)
			const typeRoleTokenGroup: FigmaGroup = {
				fontFamily: { $type: "fontFamily", $value: `{font.${typeRole.family}}`, $description: typeRole.description },
				fontSize: toPixelToken(fontSizePixels),
				lineHeight: toPixelToken(toPixels(typeRole.lineHeightRem)),
				fontWeight: { $type: "fontWeight", $value: typeRole.fontWeight },
			}
			// a role with letter spacing gets it in pixels, since the format measures no em
			if (typeRole.letterSpacingEm) {
				typeRoleTokenGroup.letterSpacing = toPixelToken(typeRole.letterSpacingEm * fontSizePixels)
			}
			return [typeRoleName, typeRoleTokenGroup]
		}),
	)
	return {
		color: colorTokens,
		radius: radiusTokens,
		font: fontFamilyTokens,
		type: typeRoleTokens,
	}
}

// a dimension token in pixels
function toPixelToken(pixels: number): FigmaToken {
	return { $type: "dimension", $value: { value: roundTo(pixels, 4), unit: "px" } }
}

// a hex or an rgba color as the format's color value, or throw an error for any other form
function toFigmaColorValue(colorValue: string): FigmaColorValue {
	// the red, green, and blue channels from 0 to 255 and the alpha, as components from 0 to 1 and the six-digit hex
	const { channels, alpha } = toColorChannels(colorValue)
	const [red, green, blue] = channels
	const hex = `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
	return { colorSpace: "srgb", components: [toComponent(red), toComponent(green), toComponent(blue)], alpha, hex }
}

// a channel from 0 to 255 as a component from 0 to 1
function toComponent(channel: number): number {
	return roundTo(channel / 255, 4)
}

// a number rounded to some decimal places
function roundTo(value: number, decimalPlaces: number): number {
	const factor = 10 ** decimalPlaces
	return Math.round(value * factor) / factor
}
