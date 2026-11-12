// the web's avatar header elements on the profile page's floated-avatar layout, under a page's heading row. the
// avatar's link leaves the tab order and the screen reader to the name's link beside it, which opens the same page,
// unless the team dropdown shows in the name's place

import { toDashboardSubjectName } from "@carlnotes/contracts/dashboards"
import type { AvatarHeaderElements, AvatarHeaderSkeletonElements } from "@carlnotes/core/components/AvatarHeader"
import { cn } from "@carlnotes/nightshift/classNames"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import {
	PAGE_AVATAR_CLASS,
	PAGE_AVATAR_SKELETON_CLASS,
	PAGE_HEADER_AVATAR_FLOAT_CLASS,
	PAGE_HEADER_DETAILS_CLASS,
	PAGE_HEADER_FLOW_CLASS,
	PAGE_HEADER_LONE_TITLE_CLASS,
	PAGE_HEADER_TITLE_CLASS,
} from "@/lib/pageHeaderClasses"
import { SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"

// the header's row, 1rem under the page's heading row
const AVATAR_HEADER_ROW_CLASS = cn(PAGE_HEADER_FLOW_CLASS, "mt-4")

/**
 * The web's avatar header: the row, the avatar's link, and the column with the name's link over the details line.
 */
export const WEB_AVATAR_HEADER_ELEMENTS: AvatarHeaderElements = {
	Row: ({ children }) => <div className={AVATAR_HEADER_ROW_CLASS}>{children}</div>,
	Avatar: ({ subject, path, hasNameLink }) => (
		<AnchorLink
			href={path}
			tabIndex={hasNameLink ? -1 : undefined}
			aria-hidden={hasNameLink ? "true" : undefined}
			aria-label={hasNameLink ? undefined : toDashboardSubjectName(subject)}
			className={PAGE_HEADER_AVATAR_FLOAT_CLASS}
		>
			{subject.subjectKind === "user" ? (
				<UserAvatar
					userId={subject.user.userId}
					username={subject.user.username}
					avatarVersion={subject.user.avatarVersion}
					className={PAGE_AVATAR_CLASS}
				/>
			) : (
				<TeamAvatar team={subject.team} className={PAGE_AVATAR_CLASS} />
			)}
		</AnchorLink>
	),
	Identity: ({ children }) => children,
	Heading: ({ path, hasDetails, teamDropdown, children }) => (
		<div className={hasDetails ? PAGE_HEADER_TITLE_CLASS : PAGE_HEADER_LONE_TITLE_CLASS}>
			{teamDropdown ?? (
				<AnchorLink href={path} className="rounded-md hover:underline">
					<h2 className="font-display truncate text-2xl">{children}</h2>
				</AnchorLink>
			)}
		</div>
	),
	Details: ({ children }) => <div className={PAGE_HEADER_DETAILS_CLASS}>{children}</div>,
}

/**
 * The header's placeholder in the loaded header's own places, hidden from assistive technology: the avatar's circle, on
 * the name's line the name's bar or the small select's shape for the team dropdown, and the details line's bar.
 */
export const WEB_AVATAR_HEADER_SKELETON_ELEMENTS: AvatarHeaderSkeletonElements = {
	Row: ({ children }) => (
		<div aria-hidden="true" className={AVATAR_HEADER_ROW_CLASS}>
			{children}
		</div>
	),
	Identity: WEB_AVATAR_HEADER_ELEMENTS.Identity,
	AvatarShape: () => <span className={PAGE_AVATAR_SKELETON_CLASS} />,
	HeadingShape: ({ hasDetails, hasTeamDropdown }) => (
		<div className={hasDetails ? PAGE_HEADER_TITLE_CLASS : PAGE_HEADER_LONE_TITLE_CLASS}>
			<div className="flex h-8 items-center">
				<span className={cn(SKELETON_SHAPE_CLASS, hasTeamDropdown ? "h-8 w-36 rounded-md" : "h-6 w-40")} />
			</div>
		</div>
	),
	DetailsShape: () => (
		<div className={cn(PAGE_HEADER_DETAILS_CLASS, "flex h-5 items-center")}>
			<span className={cn(SKELETON_SHAPE_CLASS, "h-3.5 w-64 max-w-full")} />
		</div>
	),
}
