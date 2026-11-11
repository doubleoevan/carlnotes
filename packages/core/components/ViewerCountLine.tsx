import { fetchProfileViewerCounts, fetchTeamViewerCounts } from "@carlnotes/client/viewerCountsClient"
import { VIEWER_COUNT_LABEL, type ViewerCountPage } from "@carlnotes/contracts/viewerCounts"
import { type ComponentType, type ReactNode, useCallback } from "react"
import { usePolledCounts } from "../hooks/usePolledCounts"

// the platform elements of a viewer count line: the line, and a count after its label
export type ViewerCountLineElements = {
	Line: ComponentType<{ children: ReactNode }>
	Count: ComponentType<{ label: string; count: number }>
}

type ViewerCountLineProps = {
	viewerCountPage: ViewerCountPage
	// false stops the reads while the page is off the screen
	isEnabled?: boolean
	elements: ViewerCountLineElements
}

/**
 * Shows a profile page's or a team page's viewer count as its Visitors. The count is read once the page shows and then
 * every minute, and the line is empty until the first read.
 */
export function ViewerCountLine({ viewerCountPage, isEnabled = true, elements }: ViewerCountLineProps) {
	const { Line, Count } = elements

	// read the page's own count. a public team's count and every profile's are read without credentials
	const { kind, id } = viewerCountPage
	const isTeamPublic = viewerCountPage.kind === "team" && viewerCountPage.isPublic
	const readViewerCounts = useCallback(
		(signal: AbortSignal) =>
			kind === "profile" ? fetchProfileViewerCounts(id, signal) : fetchTeamViewerCounts(id, isTeamPublic, signal),
		[kind, id, isTeamPublic],
	)
	const viewerCounts = usePolledCounts(readViewerCounts, isEnabled)
	return <Line>{viewerCounts && <Count label={VIEWER_COUNT_LABEL} count={viewerCounts.viewerCount} />}</Line>
}
