// a size grown with the system text size, as the web's icons grow with the root font size
import { useWindowDimensions } from "react-native"

// the most a size grows with the system text size. double is the 200 percent text resize the web is built for
export const MAX_FONT_SCALE = 2

/**
 * Returns a size in points grown with the system text size, up to double.
 */
export function useFontScaledSize(size: number): number {
	const { fontScale } = useWindowDimensions()
	return size * Math.min(fontScale, MAX_FONT_SCALE)
}
