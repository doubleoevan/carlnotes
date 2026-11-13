import { type TeamPageResponse, toTeamPageTitle } from "@carlnotes/contracts/teams"
import type { ComponentType, ReactNode } from "react"
import { toTeamDetails } from "../lib/teamFields"

type Container = ComponentType<{ children: ReactNode }>
export type TeamHeaderElements = {
	// the whole header, the avatar's row, the avatar's place, and the column beside it
	Frame: Container
	AvatarRow: Container
	AvatarSlot: Container
	Identity: Container
	// the title with the room's mention badge after it
	TitleRow: Container
	Title: ComponentType<{ children: string }>
	Details: ComponentType<{ details: string[] }>
	Description: ComponentType<{ children: string }>
}

/**
 * Shows a team page's identity: the avatar beside the title, its mention badge, and the counts, then the
 * description.
 */
export function TeamHeader({
	teamPage,
	noteCount,
	avatar,
	mentionBadge,
	elements: { Frame, AvatarRow, AvatarSlot, Identity, TitleRow, Title, Details, Description },
}: {
	teamPage: TeamPageResponse
	// how many notes the page's notes section lists, null until the notes load
	noteCount: number | null
	// the team's avatar, or a leader's avatar picker
	avatar: ReactNode
	// the team chat room's unseen mentions, which open the room
	mentionBadge?: ReactNode
	elements: TeamHeaderElements
}) {
	return (
		<Frame>
			<AvatarRow>
				<AvatarSlot>{avatar}</AvatarSlot>
				<Identity>
					<TitleRow>
						<Title>{toTeamPageTitle(teamPage.name)}</Title>
						{mentionBadge}
					</TitleRow>
					<Details details={toTeamDetails({ teamPage, noteCount })} />
				</Identity>
			</AvatarRow>
			{teamPage.description && <Description>{teamPage.description}</Description>}
		</Frame>
	)
}
