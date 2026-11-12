// the row of a profile's, a team's, and a Dashboard screen's avatar header: the avatar and the column beside it, which
// drops below the avatar at a large text size
import type { ReactNode } from "react"
import { View } from "react-native"

/**
 * Lays out the avatar and the column beside it.
 */
export function PageHeaderRow({ children }: { children?: ReactNode }) {
	return <View className="flex-row flex-wrap items-start gap-4">{children}</View>
}
