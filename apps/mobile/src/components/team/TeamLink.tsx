import type { TeamIdentity } from "@carlnotes/contracts/teams"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"

/**
 * Opens the native team page from its shared identity and avatar.
 */
export function TeamLink({ team }: { team: TeamIdentity }) {
	return (
		<AnchorLink
			href={`/teams/${team.teamId}`}
			accessibilityLabel={team.name}
			className="min-h-11 flex-row items-center gap-2"
		>
			<Avatar
				ownerId={team.teamId}
				name={team.name}
				imageUrl={team.avatarVersion ? `/api/team-avatars/${team.teamId}?v=${team.avatarVersion}` : null}
			/>
			<Text className="shrink text-sm text-link">{team.name}</Text>
		</AnchorLink>
	)
}
