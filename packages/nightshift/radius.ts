// the corner radius scale: one base radius, and each step's offset from it
import { toPixels } from "./units"

// the base radius, in rem, which the large step uses as it is
export const BASE_RADIUS_REM = 0.625

/**
 * Each radius step's offset from the base, in pixels.
 */
export const radiusSteps = { sm: -4, md: -2, lg: 0, xl: 4 }

/** A radius step's name. */
export type RadiusStep = keyof typeof radiusSteps

/**
 * Returns a radius step as CSS, an offset from the base radius's custom property, so the corner scales with the root
 * font size as the app's do.
 */
export function toRadiusCssValue(radiusStep: RadiusStep): string {
	// the base step reads the base as it is
	const offset = radiusSteps[radiusStep]
	if (offset === 0) {
		return "var(--radius)"
	}

	// every other step adds or takes away its pixels
	const operator = offset > 0 ? "+" : "-"
	return `calc(var(--radius) ${operator} ${Math.abs(offset)}px)`
}

/**
 * Returns a radius step in pixels, at the browser's default 16-pixel rem.
 */
export function toRadiusPixels(radiusStep: RadiusStep): number {
	return toPixels(BASE_RADIUS_REM) + radiusSteps[radiusStep]
}
