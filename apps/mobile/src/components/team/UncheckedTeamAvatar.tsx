import { toTeamAvatarImagePath } from "@carlnotes/contracts/avatars"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import type { EditedTeam } from "@carlnotes/core/lib/teamFields"
import { View } from "react-native"
import { UncheckedAvatarLine } from "@/components/avatar/UncheckedAvatarLine"
import { Avatar } from "@/components/branding/Avatar"

// the unchecked team avatar's width and height in the sheet, in points: the web modal's avatar size
const UNCHECKED_TEAM_AVATAR_SIZE = 56

// the team being edited, with the version of the avatar shown to this leader alone, if they uploaded one
export type EditedTeamWithUncheckedAvatar = EditedTeam & Pick<TeamPageResponse, "uncheckedAvatarVersion">

// the team being edited, the name its avatar's initials fall back to, and whether the leader picked another image
type UncheckedTeamAvatarProps = {
	team: EditedTeamWithUncheckedAvatar | undefined
	name: string
	isImagePicked: boolean
}

/**
 * Shows this leader's unchecked team avatar in the Edit team sheet, at the web modal's avatar size, with its
 * line under it. Nothing shows for a team with no unchecked avatar, or once the leader picks another image.
 */
export function UncheckedTeamAvatar({ team, name, isImagePicked }: UncheckedTeamAvatarProps) {
	if (!team?.uncheckedAvatarVersion || isImagePicked) {
		return null
	}
	return (
		<View className="items-start">
			<Avatar
				ownerId={team.teamId}
				name={name || team.name}
				imageUrl={toTeamAvatarImagePath(team.teamId, team.uncheckedAvatarVersion)}
				isUnchecked
				size={UNCHECKED_TEAM_AVATAR_SIZE}
			/>
			<UncheckedAvatarLine avatarSize={UNCHECKED_TEAM_AVATAR_SIZE} />
		</View>
	)
}
