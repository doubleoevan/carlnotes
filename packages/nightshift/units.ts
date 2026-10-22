// the conversion from rem to pixels at the browser's default 16-pixel rem

// the pixels in one rem, at the browser's default 16-pixel rem
const PIXELS_PER_REM = 16

/**
 * Returns a rem value in pixels, at the browser's default 16-pixel rem.
 */
export function toPixels(remValue: number): number {
	return remValue * PIXELS_PER_REM
}

/**
 * Returns a rem value and its pixels as one label, such as "0.625rem, 10px".
 */
export function toRemAndPixels(remValue: number): string {
	return `${remValue}rem, ${toPixels(remValue)}px`
}
