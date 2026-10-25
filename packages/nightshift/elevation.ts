// the raised shadow, the one elevation every raised surface takes, as its two shadows and the shadow-raised utility

/** One shadow: its offsets, blur, and spread in pixels, and its color. */
export type Shadow = {
	offsetXPixels: number
	offsetYPixels: number
	blurPixels: number
	spreadPixels: number
	color: string
}

/**
 * The raised shadow's two shadows: a short close one and a long soft one pulled in by its negative spread.
 */
export const raisedShadows: Shadow[] = [
	{ offsetXPixels: 0, offsetYPixels: 2, blurPixels: 5, spreadPixels: 0, color: "rgba(0, 0, 0, 0.2)" },
	{ offsetXPixels: 0, offsetYPixels: 8, blurPixels: 15, spreadPixels: -6, color: "rgba(0, 0, 0, 0.34)" },
]

/** The name of the utility both apps draw the raised shadow with. */
export const RAISED_SHADOW_UTILITY_NAME = "shadow-raised"

/**
 * Returns the raised shadow as a CSS @utility block.
 */
export function toRaisedShadowUtilityCss(): string {
	return [
		"/* the raised shadow, the one elevation under every raised surface */",
		`@utility ${RAISED_SHADOW_UTILITY_NAME} {`,
		`\tbox-shadow: ${raisedShadows.map(toShadowCssValue).join(", ")};`,
		"}",
	].join("\n")
}

// one shadow as CSS: the offsets, the blur, and the spread in pixels, and the color
function toShadowCssValue(shadow: Shadow): string {
	return `${shadow.offsetXPixels}px ${shadow.offsetYPixels}px ${shadow.blurPixels}px ${shadow.spreadPixels}px ${shadow.color}`
}
