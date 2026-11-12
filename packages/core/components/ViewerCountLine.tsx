import {
	fetchProfileViewerCounts,
	fetchTeamViewerCounts,
	fetchTopicPostViewerCounts,
} from "@carlnotes/client/viewerCountsClient"
import { toDashboardLinks } from "@carlnotes/contracts/dashboards"
import { VIEWER_COUNT_LABEL, type ViewerCountPage } from "@carlnotes/contracts/viewerCounts"
import { type ComponentType, type ReactNode, useCallback } from "react"
import { usePolledCounts } from "../hooks/usePolledCounts"

// the platform elements of a viewer count line: the line, a count after its label, and a link to a page's Dashboards
export type ViewerCountLineElements = {
	Line: ComponentType<{ children: ReactNode }>
	Count: ComponentType<{ label: string; count: number }>
	DashboardLink: ComponentType<{ label: string; path: string }>
}

type ViewerCountLineProps = {
	viewerCountPage: ViewerCountPage
	// false stops the reads while the page is off the screen
	isEnabled?: boolean
	elements: ViewerCountLineElements
}

/**
 * Shows a profile page's, a team page's, or a Topic Post page's viewer count as its Visitors, then a profile's and a
 * team's links to their Dashboards. The count is read once the page shows and then every minute, and shows nothing
 * until the first read.
 */
export function ViewerCountLine({ viewerCountPage, isEnabled = true, elements }: ViewerCountLineProps) {
	const { Line, Count, DashboardLink } = elements

	// read the page's own count. every profile's count, a public team's, and a Topic Post's on a public Topic are read
	// without credentials
	const { kind, id } = viewerCountPage
	const isPublic = viewerCountPage.kind === "profile" || viewerCountPage.isPublic
	const readViewerCounts = useCallback(
		(signal: AbortSignal) => {
			switch (kind) {
				case "profile":
					return fetchProfileViewerCounts(id, signal)
				case "team":
					return fetchTeamViewerCounts(id, isPublic, signal)
				case "topicPost":
					return fetchTopicPostViewerCounts(id, isPublic, signal)
			}
		},
		[kind, id, isPublic],
	)
	const viewerCounts = usePolledCounts(readViewerCounts, isEnabled)
	return (
		<Line>
			{viewerCounts && <Count label={VIEWER_COUNT_LABEL} count={viewerCounts.viewerCount} />}
			{toDashboardLinks(viewerCountPage).map(({ label, path }) => (
				<DashboardLink key={path} label={label} path={path} />
			))}
		</Line>
	)
}
