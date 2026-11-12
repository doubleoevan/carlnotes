// a Dashboard page's subject header: the avatar header of the page's person or team with the page's summary counts on
// its details line, and the team dropdown in the team's name's place on Team Dashboard
import type { DashboardSummary } from "@carlnotes/contracts/dashboards"
import type { ReactNode } from "react"
import { AvatarHeader, type AvatarHeaderElements, type AvatarHeaderSubject } from "./AvatarHeader"
import { DashboardSummaryStrip, type DashboardSummaryStripElements } from "./DashboardSummaryStrip"

// each app's avatar header elements, and the summary strip's details line
export type DashboardSubjectHeaderElements = AvatarHeaderElements & DashboardSummaryStripElements

/**
 * Shows the person's or team's avatar header with the page's summary counts, whose line keeps its place until the
 * snapshot loads.
 */
export function DashboardSubjectHeader({
	subject,
	summary,
	teamDropdown,
	elements,
}: {
	subject: AvatarHeaderSubject
	summary: DashboardSummary | undefined
	teamDropdown?: ReactNode
	elements: DashboardSubjectHeaderElements
}) {
	return (
		<AvatarHeader
			subject={subject}
			details={summary ? <DashboardSummaryStrip summary={summary} elements={elements} /> : null}
			teamDropdown={teamDropdown}
			elements={elements}
		/>
	)
}
