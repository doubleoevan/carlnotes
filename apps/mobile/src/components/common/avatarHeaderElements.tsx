// the app's avatar header elements, laid out like the profile screen's: the avatar at the profile screen's size, then
// the name in the display font, or the team dropdown in the team's name's place, over the details line. the avatar's
// link leaves the screen reader to the name's link beside it, which opens the same page, unless the team dropdown shows
// in the name's place
import { toAvatarImagePath, toTeamAvatarImagePath } from "@carlnotes/contracts/avatars"
import { toDashboardSubjectName } from "@carlnotes/contracts/dashboards"
import type { AvatarHeaderElements, AvatarHeaderSkeletonElements } from "@carlnotes/core/components/AvatarHeader"
import { cn } from "@carlnotes/nightshift/classNames"
import { View } from "react-native"
import { Avatar, PAGE_AVATAR_SIZE } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageHeaderIdentity } from "@/components/common/PageHeaderIdentity"
import { PageHeaderRow } from "@/components/common/PageHeaderRow"
import { SkeletonPulse } from "@/components/common/SkeletonPulse"
import { Text } from "@/components/primitives/text"
import { SKELETON_SHAPE_CLASS } from "@/sectionClasses"

// the name alone beside the avatar, with no details line under it, centered on the avatar under the column's own top
// padding
const LONE_HEADING_CLASS = "pt-4"

/**
 * The app's avatar header: the row, the avatar's link, and the column with the name's link over the details line.
 */
export const MOBILE_AVATAR_HEADER_ELEMENTS: AvatarHeaderElements = {
	Row: PageHeaderRow,
	Avatar: ({ subject, path, hasNameLink }) => (
		<AnchorLink
			href={path}
			accessibilityLabel={toDashboardSubjectName(subject)}
			accessibilityElementsHidden={hasNameLink}
			importantForAccessibility={hasNameLink ? "no-hide-descendants" : "auto"}
		>
			{subject.subjectKind === "user" ? (
				<Avatar
					ownerId={subject.user.userId}
					name={subject.user.username}
					imageUrl={
						subject.user.avatarVersion ? toAvatarImagePath(subject.user.userId, subject.user.avatarVersion) : null
					}
					size={PAGE_AVATAR_SIZE}
				/>
			) : (
				<Avatar
					ownerId={subject.team.teamId}
					name={subject.team.name}
					imageUrl={
						subject.team.avatarVersion ? toTeamAvatarImagePath(subject.team.teamId, subject.team.avatarVersion) : null
					}
					size={PAGE_AVATAR_SIZE}
				/>
			)}
		</AnchorLink>
	),
	Identity: PageHeaderIdentity,
	Heading: ({ path, hasDetails, teamDropdown, children }) => (
		<View className={hasDetails ? undefined : LONE_HEADING_CLASS}>
			{teamDropdown ? (
				<View className="items-start">{teamDropdown}</View>
			) : (
				<AnchorLink href={path} accessibilityLabel={children}>
					<Text accessibilityRole="header" numberOfLines={1} className="font-display text-2xl">
						{children}
					</Text>
				</AnchorLink>
			)}
		</View>
	),
	Details: ({ children }) => <View>{children}</View>,
}

/**
 * The header's placeholder in the loaded header's own row and column, pulsing and hidden from assistive technology: the
 * avatar's circle, on the name's line the name's bar or the select's shape for the team dropdown, and the details line's
 * bar.
 */
export const MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS: AvatarHeaderSkeletonElements = {
	Row: ({ children }) => (
		<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			<SkeletonPulse>
				<PageHeaderRow>{children}</PageHeaderRow>
			</SkeletonPulse>
		</View>
	),
	Identity: PageHeaderIdentity,
	AvatarShape: () => (
		<View
			className={cn(SKELETON_SHAPE_CLASS, "rounded-full")}
			style={{ width: PAGE_AVATAR_SIZE, height: PAGE_AVATAR_SIZE }}
		/>
	),
	HeadingShape: ({ hasDetails, hasTeamDropdown }) => (
		<View className={hasDetails ? undefined : LONE_HEADING_CLASS}>
			{hasTeamDropdown ? (
				<View className={cn(SKELETON_SHAPE_CLASS, "h-12 w-36 rounded-md")} />
			) : (
				<View className="h-8 justify-center">
					<View className={cn(SKELETON_SHAPE_CLASS, "h-6 w-40")} />
				</View>
			)}
		</View>
	),
	DetailsShape: () => (
		<View className="h-5 justify-center">
			<View className={cn(SKELETON_SHAPE_CLASS, "h-3.5 w-64 max-w-full")} />
		</View>
	),
}
