import type { ViewerCountPage } from "@carlnotes/contracts/viewerCounts"
import {
	ViewerCountLine as SharedViewerCountLine,
	type ViewerCountLineElements,
} from "@carlnotes/core/components/ViewerCountLine"
import { FlashingCount } from "@/components/common/FlashingCount"
import { COUNTS_LINE_CLASS } from "@/lib/styleClasses"

// the web's elements. the line keeps one line of height while it is empty, and the count flashes on a change
const VIEWER_COUNT_LINE_ELEMENTS: ViewerCountLineElements = {
	Line: ({ children }) => <p className={COUNTS_LINE_CLASS}>{children}</p>,
	Count: FlashingCount,
}

/**
 * A profile page's or a team page's last line on the web, with its Visitors count, empty in the server render.
 */
export function ViewerCountLine({ viewerCountPage }: { viewerCountPage: ViewerCountPage }) {
	return <SharedViewerCountLine viewerCountPage={viewerCountPage} elements={VIEWER_COUNT_LINE_ELEMENTS} />
}
