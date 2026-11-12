// a Dashboard page's header: the page icon and heading, and under it the person's or team's avatar at the profile
// page's size beside their name in the display font, or the team dropdown in the team's name's place, and the page's
// summary counts
import {
	DASHBOARD_PAGE_HEADINGS,
	type DashboardKind,
	type DashboardSubjectIdentity,
	type DashboardSummary,
} from "@carlnotes/contracts/dashboards"
import { AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import {
	DashboardSubjectHeader,
	type DashboardSubjectHeaderElements,
} from "@carlnotes/core/components/DashboardSubjectHeader"
import type { ReactNode } from "react"
import {
	WEB_AVATAR_HEADER_ELEMENTS,
	WEB_AVATAR_HEADER_SKELETON_ELEMENTS,
} from "@/components/common/avatarHeaderElements"
import { DetailsLine } from "@/components/common/DetailsLine"
import { PAGE_TITLE_CLASS } from "@/lib/styleClasses"
import { DASHBOARD_PAGE_ICONS } from "./dashboardPageIcons"

/**
 * Shows the page's icon and heading, then the subject header, which holds its placeholder while the subject loads and
 * is left out for a Dashboard that was not found.
 */
export function DashboardHeader({
	dashboardKind,
	subject,
	summary,
	isSubjectHeaderShown,
	hasTeamDropdown = false,
	teamDropdown,
}: {
	dashboardKind: DashboardKind
	subject: DashboardSubjectIdentity | undefined
	summary: DashboardSummary | undefined
	isSubjectHeaderShown: boolean
	hasTeamDropdown?: boolean
	teamDropdown?: ReactNode
}) {
	const PageIcon = DASHBOARD_PAGE_ICONS[dashboardKind]
	return (
		<>
			{/* the page heading with the same icon as its user menu row */}
			<h1 className={PAGE_TITLE_CLASS}>
				<PageIcon className="size-6" />
				{DASHBOARD_PAGE_HEADINGS[dashboardKind]}
			</h1>

			{/* the person's or team's avatar, name, and summary counts, with placeholders while the snapshot loads */}
			{isSubjectHeaderShown &&
				(subject ? (
					<DashboardSubjectHeader
						subject={subject}
						summary={summary}
						teamDropdown={teamDropdown}
						elements={SUBJECT_HEADER_ELEMENTS}
					/>
				) : (
					<AvatarHeaderSkeleton
						hasDetails
						hasTeamDropdown={hasTeamDropdown}
						elements={WEB_AVATAR_HEADER_SKELETON_ELEMENTS}
					/>
				))}
		</>
	)
}

// the web's avatar header with the summary strip's details line
const SUBJECT_HEADER_ELEMENTS: DashboardSubjectHeaderElements = { ...WEB_AVATAR_HEADER_ELEMENTS, DetailsLine }
