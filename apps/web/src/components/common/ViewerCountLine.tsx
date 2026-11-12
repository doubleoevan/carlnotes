import type { ViewerCountPage } from "@carlnotes/contracts/viewerCounts"
import {
	ViewerCountLine as SharedViewerCountLine,
	type ViewerCountLineElements,
} from "@carlnotes/core/components/ViewerCountLine"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FlashingCount } from "@/components/common/FlashingCount"
import { VIEWER_COUNT_LINE_CLASS } from "@/lib/styleClasses"

// the web's elements. the line keeps one line of height while it is empty and wraps its links on a phone, the count
// flashes on a change, and a Dashboard link reads in the display font like the count's label
const VIEWER_COUNT_LINE_ELEMENTS: ViewerCountLineElements = {
	Line: ({ children }) => <p className={VIEWER_COUNT_LINE_CLASS}>{children}</p>,
	Count: FlashingCount,
	DashboardLink: ({ label, path }) => (
		<AnchorLink href={path} className="font-display text-link hover:underline">
			{label}
		</AnchorLink>
	),
}

/**
 * A profile page's, a team page's, or a Topic Post page's last line on the web, with its Visitors count, empty in the
 * server render.
 */
export function ViewerCountLine({ viewerCountPage }: { viewerCountPage: ViewerCountPage }) {
	return <SharedViewerCountLine viewerCountPage={viewerCountPage} elements={VIEWER_COUNT_LINE_ELEMENTS} />
}
