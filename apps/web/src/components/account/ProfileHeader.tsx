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
import { PAGE_AVATAR_CLASS } from "@/lib/styleClasses"
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
const PROFILE_HEADER_ELEMENTS: ProfileHeaderElements = {
	Row: ({ children }) => <div className="flex flex-wrap items-center gap-4">{children}</div>,
	OwnAvatar: OwnProfileAvatar,
	Avatar: ({ userId, username, avatarVersion }) => (
		<UserAvatar userId={userId} username={username} avatarVersion={avatarVersion} className={PAGE_AVATAR_CLASS} />
	),
	Identity: ({ children }) => <div className="w-full min-w-0 sm:w-auto sm:flex-1">{children}</div>,
	Heading: ({ isAccountLink, children }) => {
		const heading = <h1 className="font-display text-2xl">{children}</h1>
		return isAccountLink ? (
			<AnchorLink href="/account" className="rounded-md hover:underline">
				{heading}
			</AnchorLink>
		) : (
			heading
		)
	},
	SummaryLine: ProfileSummaryLine,
}

/**
 * Renders the shared profile header on the web.
 */
export function ProfileHeader(props: ProfileHeaderProps) {
	return <SharedProfileHeader {...props} elements={PROFILE_HEADER_ELEMENTS} />
}
