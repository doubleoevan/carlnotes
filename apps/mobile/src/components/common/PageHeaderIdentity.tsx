// the column beside the avatar in a profile's, a team's, and a Dashboard screen's avatar header, with the title over
// the counts. the column drops below the avatar if it would be narrower than its minimum width
import type { ReactNode } from "react"
import { View } from "react-native"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"

// the column's minimum width in points at the default text size
const IDENTITY_MIN_WIDTH = 192

/**
 * Stacks the title and the counts beside the avatar, or below it at a large text size.
 */
export function PageHeaderIdentity({ children }: { children?: ReactNode }) {
	// the minimum width is the column's basis, which the row's wrap measures, and the column grows to the row's end
	const flexBasis = useFontScaledSize(IDENTITY_MIN_WIDTH)
	return (
		<View className="grow gap-1 pt-2" style={{ flexBasis }}>
			{children}
		</View>
	)
}
