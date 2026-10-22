// the Tokens page's swatches: every color token with its light and dark value and the radius scale, each read from
// the Nightshift TypeScript source
import { type ColorMode, type ColorName, type ColorToken, colors } from "@carlnotes/nightshift/colors"
import {
	BASE_RADIUS_REM,
	type RadiusStep,
	radiusSteps,
	toRadiusCssValue,
	toRadiusPixels,
} from "@carlnotes/nightshift/radius"
import { extraThemeColorNames, shadcnThemeColorNames, toKebabName } from "@carlnotes/nightshift/theme"
import { toRemAndPixels } from "@carlnotes/nightshift/units"
import type { CSSProperties } from "react"
import { CODE_STYLE, DESCRIPTION_STYLE, NAME_STYLE, SECTION_CARD_STYLE } from "./pageStyles"

// the color token names, in the order tokens.css declares them
const COLOR_NAMES = Object.keys(colors) as ColorName[]

// the radius steps, smallest first
const RADIUS_STEPS = Object.keys(radiusSteps) as RadiusStep[]

// a color row: the name and description, then the two swatches, which wrap below them on a phone
const COLOR_ROW_STYLE: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }
const COLOR_TEXT_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem", flex: "1 1 16rem" }
const SWATCH_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem", flex: "0 0 8rem" }

// a swatch's box, outlined so a fill close to the card still shows its edge
const SWATCH_BOX_STYLE: CSSProperties = {
	height: "3rem",
	border: "1px solid var(--border)",
	borderRadius: toRadiusCssValue("sm"),
}

// the mode label under a swatch
const SWATCH_LABEL_STYLE: CSSProperties = { margin: 0, fontSize: "0.75rem", fontWeight: 600 }

// each mode's label under its swatch
const MODE_LABELS: Record<ColorMode, string> = { light: "Light", dark: "Dark" }

// the radius boxes, in a row that wraps
const RADIUS_LIST_STYLE: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "1.5rem",
	margin: 0,
	padding: 0,
	listStyle: "none",
}
const RADIUS_ITEM_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem" }
const RADIUS_BOX_STYLE: CSSProperties = {
	width: "5rem",
	height: "5rem",
	border: "2px solid var(--muted-foreground)",
	background: "var(--secondary)",
}

/**
 * Shows every color token as a row: its name, its description, the custom property and Tailwind utilities it maps to,
 * and its light and dark values side by side.
 */
export function TokenSwatches() {
	return (
		<ul className="sb-unstyled" style={SECTION_CARD_STYLE}>
			{COLOR_NAMES.map((colorName) => (
				<ColorRow key={colorName} colorName={colorName} />
			))}
		</ul>
	)
}

/**
 * Shows the base radius, then each radius step as a box with that corner radius, its pixels, its Tailwind utility,
 * and its offset from the base.
 */
export function RadiusScale() {
	return (
		<div className="sb-unstyled" style={SECTION_CARD_STYLE}>
			{/* the base radius */}
			<p style={CODE_STYLE}>--radius: {toRemAndPixels(BASE_RADIUS_REM)} at the default 16-pixel rem</p>

			{/* the steps */}
			<ul style={RADIUS_LIST_STYLE}>
				{RADIUS_STEPS.map((radiusStep) => (
					<RadiusBox key={radiusStep} radiusStep={radiusStep} />
				))}
			</ul>
		</div>
	)
}

// one color token's row
function ColorRow({ colorName }: { colorName: ColorName }) {
	// the token and the names it maps to
	const colorToken: ColorToken = colors[colorName]
	const kebabName = toKebabName(colorName)
	const themeGroupLabel = toThemeGroupLabel(colorName)

	return (
		<li style={COLOR_ROW_STYLE}>
			{/* the name, the description, and the custom property and utilities */}
			<div style={COLOR_TEXT_STYLE}>
				<p style={NAME_STYLE}>{colorName}</p>
				<p style={DESCRIPTION_STYLE}>{colorToken.description}</p>
				<p style={CODE_STYLE}>--{kebabName}</p>
				{themeGroupLabel ? (
					<p style={CODE_STYLE}>
						{themeGroupLabel}: --color-{kebabName}, bg-{kebabName}, text-{kebabName}, border-{kebabName}
					</p>
				) : (
					<p style={CODE_STYLE}>no Tailwind utility: use var(--{kebabName})</p>
				)}
			</div>

			{/* the light and dark values side by side */}
			<Swatch colorMode="light" colorValue={colorToken.light} />
			<Swatch colorMode="dark" colorValue={colorToken.dark} />
		</li>
	)
}

// the theme group a color token's utility belongs to, or undefined for a token the theme does not map
function toThemeGroupLabel(colorName: ColorName): string | undefined {
	if (shadcnThemeColorNames.includes(colorName)) {
		return "shadcn theme"
	}
	if (extraThemeColorNames.includes(colorName)) {
		return "CarlNotes theme extra"
	}
	return undefined
}

// one swatch: a box filled with the literal value over that mode's page, labeled with its mode and its value. the
// page under it shows a translucent value as the app paints it, and an opaque value covers it
function Swatch({ colorMode, colorValue }: { colorMode: ColorMode; colorValue: string }) {
	const swatchBackground = `linear-gradient(${colorValue}, ${colorValue}), ${colors.background[colorMode]}`
	return (
		<div style={SWATCH_STYLE}>
			<div aria-hidden style={{ ...SWATCH_BOX_STYLE, background: swatchBackground }} />
			<p style={SWATCH_LABEL_STYLE}>{MODE_LABELS[colorMode]}</p>
			<p style={CODE_STYLE}>{colorValue}</p>
		</div>
	)
}

// one radius step: a box with that corner radius, its name, its pixels at the default rem, its utility, and its offset
// from the base
function RadiusBox({ radiusStep }: { radiusStep: RadiusStep }) {
	return (
		<li style={RADIUS_ITEM_STYLE}>
			<div aria-hidden style={{ ...RADIUS_BOX_STYLE, borderRadius: toRadiusCssValue(radiusStep) }} />
			<p style={NAME_STYLE}>{radiusStep}</p>
			<p style={CODE_STYLE}>
				{toRadiusPixels(radiusStep)}px, rounded-{radiusStep}
			</p>
			<p style={DESCRIPTION_STYLE}>{toOffsetLabel(radiusSteps[radiusStep])}</p>
		</li>
	)
}

// a radius step's offset from the base, in words
function toOffsetLabel(offsetPixels: number): string {
	if (offsetPixels === 0) {
		return "the base radius"
	}
	return offsetPixels > 0 ? `the base plus ${offsetPixels}px` : `the base minus ${-offsetPixels}px`
}
