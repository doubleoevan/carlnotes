import type { TeamIdentity } from "@carlnotes/contracts/teams"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Text } from "@/components/primitives/text"

/**
 * Opens the native team page from its shared identity and avatar, with the team's update count beside its name.
 */
export function TeamLink({ team }: { team: TeamIdentity }) {
	return (
		<View className="min-w-0 flex-row items-center gap-2">
			<AnchorLink
				href={`/teams/${team.teamId}`}
				accessibilityLabel={team.name}
				className="min-h-11 min-w-0 shrink flex-row items-center gap-2"
			>
				<Avatar
					ownerId={team.teamId}
					name={team.name}
					imageUrl={team.avatarVersion ? `/api/team-avatars/${team.teamId}?v=${team.avatarVersion}` : null}
				/>
				<Text className="shrink text-sm text-link">{team.name}</Text>
			</AnchorLink>
			<PageUpdateCountBadge topicId={null} teamId={team.teamId} href={`/teams/${team.teamId}`} />
		</View>
	)
}
