// a page's avatar header, laid out like the profile page's: a person's or team's avatar at the profile page's size
// beside their name in the display font, both opening the person's profile page or the team's page, with a details
// line under the name if the page has one. Specials, Teams, Activity, and Account each open with it
import { type DashboardSubjectIdentity, toDashboardSubjectName } from "@carlnotes/contracts/dashboards"
import { toProfilePath, toTeamPath } from "@carlnotes/contracts/seo"
import type { ComponentType, ReactNode } from "react"

// the person or team the header shows, the same identity a Dashboard's subject has
export type AvatarHeaderSubject = DashboardSubjectIdentity

// each app's elements: the row, the avatar that opens the subject's page and is its only link while the team dropdown
// shows, the column beside it, the name in the display font or the team dropdown in its place, centered on the avatar
// if no details line follows, and the details line
export type AvatarHeaderElements = {
	Row: ComponentType<{ children: ReactNode }>
	Avatar: ComponentType<{ subject: AvatarHeaderSubject; path: string; hasNameLink: boolean }>
	Identity: ComponentType<{ children: ReactNode }>
	Heading: ComponentType<{ path: string; hasDetails: boolean; teamDropdown?: ReactNode; children: string }>
	Details: ComponentType<{ children: ReactNode }>
}

// each app's placeholder elements in the loaded header's own row and column: the avatar's circle, on the name's line the
// name's bar or the team dropdown's shape, and the details line's bar under it
export type AvatarHeaderSkeletonElements = Pick<AvatarHeaderElements, "Row" | "Identity"> & {
	AvatarShape: ComponentType
	HeadingShape: ComponentType<{ hasDetails: boolean; hasTeamDropdown: boolean }>
	DetailsShape: ComponentType
}

/**
 * Shows the person's or team's avatar beside their name, with the details line under it if the page passes one. A
 * null details line keeps the line's place while it loads. The team dropdown, if the page passes one, shows in the
 * team's name's place.
 */
export function AvatarHeader({
	subject,
	details,
	teamDropdown,
	elements,
}: {
	subject: AvatarHeaderSubject
	details?: ReactNode
	teamDropdown?: ReactNode
	elements: AvatarHeaderElements
}) {
	// the page that the avatar and the name both open, and whether a details line follows the name
	const { Row, Avatar, Identity, Heading, Details } = elements
	const path = subject.subjectKind === "user" ? toProfilePath(subject.user.userId) : toTeamPath(subject.team.teamId)
	const hasDetails = details !== undefined
	return (
		<Row>
			<Avatar subject={subject} path={path} hasNameLink={!teamDropdown} />
			<Identity>
				<Heading path={path} hasDetails={hasDetails} teamDropdown={teamDropdown}>
					{toDashboardSubjectName(subject)}
				</Heading>
				{details && <Details>{details}</Details>}
			</Identity>
		</Row>
	)
}

/**
 * Holds the header's place while its subject loads: the avatar's circle beside the name's bar, or the team dropdown's
 * shape if the dropdown will show, over the details line's bar if the page has one.
 */
export function AvatarHeaderSkeleton({
	hasDetails = false,
	hasTeamDropdown = false,
	elements,
}: {
	hasDetails?: boolean
	hasTeamDropdown?: boolean
	elements: AvatarHeaderSkeletonElements
}) {
	const { Row, Identity, AvatarShape, HeadingShape, DetailsShape } = elements
	return (
		<Row>
			<AvatarShape />
			<Identity>
				<HeadingShape hasDetails={hasDetails} hasTeamDropdown={hasTeamDropdown} />
				{hasDetails && <DetailsShape />}
			</Identity>
		</Row>
	)
}
