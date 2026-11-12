// the app's profile header: the shared header over the avatar picker with the user menu's Café count, the avatar, and
// the screen's heading
import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import {
	type ProfileHeaderElements,
	type ProfileHeaderProps,
	ProfileHeader as SharedProfileHeader,
} from "@carlnotes/core/components/ProfileHeader"
import { View } from "react-native"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { Avatar, PAGE_AVATAR_SIZE } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageHeaderIdentity } from "@/components/common/PageHeaderIdentity"
import { PageHeaderRow } from "@/components/common/PageHeaderRow"
import { UserMenuUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Text } from "@/components/primitives/text"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

// the heading in the display font
function ProfileHeading({ children }: { children: string }) {
	return (
		<Text accessibilityRole="header" className="font-display text-2xl">
			{children}
		</Text>
	)
}

// the app's elements, with the avatar at the height of a topic's image on the Topics screen and the name and the
// summary line beside it
const ELEMENTS: ProfileHeaderElements = {
	Row: PageHeaderRow,
	OwnAvatar: ({ userId, username }) => (
		<View>
			<UserAvatarPicker userId={userId} username={username} size={PAGE_AVATAR_SIZE} />
			<UserMenuUpdateCountBadge label="Profile" className="absolute -top-1 -right-1" />
		</View>
	),
	Avatar: ({ userId, username, avatarVersion }) => (
		<Avatar
			ownerId={userId}
			name={username}
			imageUrl={avatarVersion ? toAvatarImagePath(userId, avatarVersion) : null}
			size={PAGE_AVATAR_SIZE}
		/>
	),
	Identity: PageHeaderIdentity,
	Heading: ({ isAccountLink, username, children }) =>
		isAccountLink ? (
			<AnchorLink href="/account" accessibilityLabel={`${username}'s account`}>
				<ProfileHeading>{children}</ProfileHeading>
			</AnchorLink>
		) : (
			<ProfileHeading>{children}</ProfileHeading>
		),
	SummaryLine: ProfileSummaryLine,
}

/**
 * Renders the shared profile header in the app.
 */
export function ProfileHeader(props: ProfileHeaderProps) {
	return <SharedProfileHeader {...props} elements={ELEMENTS} />
}
