import type { ViewerCountPage } from "@carlnotes/contracts/viewerCounts"
import {
	ViewerCountLine as SharedViewerCountLine,
	type ViewerCountLineElements,
} from "@carlnotes/core/components/ViewerCountLine"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Count } from "@/components/common/Count"
import { Text } from "@/components/primitives/text"
import { COUNTS_LINE_CLASS } from "@/sectionClasses"

// the app's elements. the line keeps one line of height while it is empty, and a Dashboard link reads in the display
// font like the count's label
const VIEWER_COUNT_LINE_ELEMENTS: ViewerCountLineElements = {
	Line: ({ children }) => <View className={COUNTS_LINE_CLASS}>{children}</View>,
	Count,
	DashboardLink: ({ label, path }) => (
		<AnchorLink href={path} accessibilityLabel={label}>
			<Text style={{ fontFamily: fontFamilies.display.name }} className="text-sm text-link">
				{label}
			</Text>
		</AnchorLink>
	),
}

/**
 * Shows the Visitors line at the end of a profile, team, or Topic Post screen. The count is read only while the screen
 * is the active route.
 */
export function ViewerCountLine({
	viewerCountPage,
	isActiveRoute,
}: {
	viewerCountPage: ViewerCountPage
	isActiveRoute: boolean
}) {
	return (
		<SharedViewerCountLine
			viewerCountPage={viewerCountPage}
			isEnabled={isActiveRoute}
			elements={VIEWER_COUNT_LINE_ELEMENTS}
		/>
	)
}
