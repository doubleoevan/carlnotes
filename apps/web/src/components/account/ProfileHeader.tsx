// the web's profile header: the shared header over the avatar picker with the user menu's Café count, the avatar, and
// the page's heading
import {
	type ProfileHeaderElements,
	type ProfileHeaderProps,
	ProfileHeader as SharedProfileHeader,
} from "@carlnotes/core/components/ProfileHeader"
import { useUserMenuUpdateBadges } from "@carlnotes/core/hooks/useUpdateCounts"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import {
	PAGE_AVATAR_CLASS,
	PAGE_HEADER_AVATAR_FLOAT_CLASS,
	PAGE_HEADER_DETAILS_CLASS,
	PAGE_HEADER_FLOW_CLASS,
	PAGE_HEADER_TITLE_CLASS,
} from "@/lib/pageHeaderClasses"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

// the person's own avatar, which opens the picker, with the one count of their topics' unread chat mentions and note
// changes, the user menu's Café row
function OwnProfileAvatar({ userId, username }: { userId: string; username: string }) {
	const profileUpdateBadges = useUserMenuUpdateBadges().Profile
	return (
		<span className="relative inline-block">
			<UserAvatarPicker userId={userId} username={username} className={PAGE_AVATAR_CLASS} />
			<UpdateCountBadge
				{...profileUpdateBadges}
				className="absolute -top-1 -right-1"
				countBadgeClassName="h-5 min-w-5 text-xs"
			/>
		</span>
	)
}

// the web's elements, with the avatar at the height of a topic's image on the Topics page
export const PROFILE_HEADER_ELEMENTS: ProfileHeaderElements = {
	Row: ({ children }) => <div className={PAGE_HEADER_FLOW_CLASS}>{children}</div>,
	OwnAvatar: (ownAvatarProps) => (
		<div className={PAGE_HEADER_AVATAR_FLOAT_CLASS}>
			<OwnProfileAvatar {...ownAvatarProps} />
		</div>
	),
	Avatar: ({ userId, username, avatarVersion }) => (
		<div className={PAGE_HEADER_AVATAR_FLOAT_CLASS}>
			<UserAvatar userId={userId} username={username} avatarVersion={avatarVersion} className={PAGE_AVATAR_CLASS} />
		</div>
	),
	Identity: ({ children }) => children,
	Heading: ({ isAccountLink, children }) => {
		const heading = <h1 className="font-display text-2xl">{children}</h1>
		return (
			<div className={PAGE_HEADER_TITLE_CLASS}>
				{isAccountLink ? (
					<AnchorLink href="/account" className="rounded-md hover:underline">
						{heading}
					</AnchorLink>
				) : (
					heading
				)}
			</div>
		)
	},
	SummaryLine: (summaryLineProps) => (
		<div className={PAGE_HEADER_DETAILS_CLASS}>
			<ProfileSummaryLine {...summaryLineProps} />
		</div>
	),
}

/**
 * Renders the shared profile header on the web.
 */
export function ProfileHeader(props: ProfileHeaderProps) {
	return <SharedProfileHeader {...props} elements={PROFILE_HEADER_ELEMENTS} />
}
