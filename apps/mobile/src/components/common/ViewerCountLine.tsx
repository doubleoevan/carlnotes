import type { ViewerCountPage } from "@carlnotes/contracts/viewerCounts"
import {
	ViewerCountLine as SharedViewerCountLine,
	type ViewerCountLineElements,
} from "@carlnotes/core/components/ViewerCountLine"
import { View } from "react-native"
import { Count } from "@/components/common/Count"

// the app's elements. the line keeps one line of height while it is empty
const VIEWER_COUNT_LINE_ELEMENTS: ViewerCountLineElements = {
	Line: ({ children }) => <View className="mx-4 mt-8 min-h-5 flex-row items-center justify-center">{children}</View>,
	Count,
}

/**
 * A profile screen's or a team screen's last line in the app, with its Visitors count. The count is read only while
 * the screen is the active route.
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
