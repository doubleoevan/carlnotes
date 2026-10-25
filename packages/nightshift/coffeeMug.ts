// the coffee mug beside the CarlNotes name: its view box, the cup and handle paths, the strokes, the steam wisps, and
// the steam's motion

/** The side of the mug's square view box, in its own units. */
export const COFFEE_MUG_VIEW_BOX_SIZE = 32

/** The mug's view box, as the svg attribute. */
export const COFFEE_MUG_VIEW_BOX = `0 0 ${COFFEE_MUG_VIEW_BOX_SIZE} ${COFFEE_MUG_VIEW_BOX_SIZE}`

/** The cup body with a flat rim and a rounded bottom, drawn once as a faint fill and once as the outline. */
export const COFFEE_MUG_CUP_PATH = "M8 13 L8 17 A7 7 0 0 0 22 17 L22 13 Z"

/** The mug's handle. */
export const COFFEE_MUG_HANDLE_PATH = "M22 15 h2.5 a3 3 0 0 1 0 6 H22"

/** How the mug draws: the cup and handle's stroke width, the cup's faint fill, and the steam's stroke and opacity. */
export const coffeeMugStyle = {
	cupStrokeWidth: 1.8,
	cupFillOpacity: 0.2,
	steamStrokeWidth: 1.5,
	steamOpacity: 0.7,
}

/** The steam wisps above the cup: each one's x position, and its delay so the three rise in turn. */
export const coffeeMugSteamWisps = [
	{ x: 11.5, delayMs: 0 },
	{ x: 15, delayMs: 600 },
	{ x: 18.5, delayMs: 1200 },
]

/**
 * How each wisp moves, in view box units. A wisp rises once per period, fades in to its peak opacity and out by the
 * end, and widens as it rises. On a screen narrower than the md breakpoint, as on a phone, and under reduced motion, a
 * wisp holds still at its resting opacity.
 */
export const coffeeMugSteamMotion = {
	periodMs: 2400,
	peakFraction: 0.35,
	peakOpacity: 0.5,
	startOffsetY: 1,
	endOffsetY: -9,
	endWidthScale: 1.5,
	restingOpacity: 0.5,
}

/**
 * Returns one steam wisp's wavy path, starting just above the cup's rim at its x position.
 */
export function toSteamWispPath(x: number): string {
	return `M${x} 10.5 q-2 -1.6 0 -3.2 q2 -1.6 0 -3.2`
}
