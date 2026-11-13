import { sendRemoveTopicFromTeam } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { TeamSections as SharedTeamSections, type TeamSectionsElements } from "@carlnotes/core/components/TeamSections"
import { TEAM_TOPICS_TOOLTIP } from "@carlnotes/core/lib/cardSections"
import type { ReactNode } from "react"
import { PAGE_SECTIONS_ELEMENTS } from "@/components/common/pageSectionsElements"
import { TableCard } from "@/components/table/TableCard"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TopicsTable } from "@/components/table/TopicsTable"

/**
 * A team page's sections inside the page's accordion: the card sections, the members, the topics with a leader's
 * remove, and the notes section the page passes.
 */
export function TeamSections({
	teamPage,
	notesSection,
	onChanged,
}: {
	teamPage: TeamPageResponse
	notesSection: ReactNode
	onChanged: () => void
}) {
	const isTeamLeader = isLeaderRole(teamPage.role)
	return (
		<SharedTeamSections
			teamPage={teamPage}
			membersTable={
				<TableCard className="mb-2">
					<TeamMembersTable
						teamId={teamPage.teamId}
						members={teamPage.members}
						hiddenMemberCount={teamPage.hiddenMemberCount}
						isTeamLeader={isTeamLeader}
						onChanged={onChanged}
					/>
				</TableCard>
			}
			topicsTable={
				<TopicsTable
					topics={teamPage.topics}
					includesNonPublicTopics={Boolean(teamPage.role)}
					topicTooltip={TEAM_TOPICS_TOOLTIP}
					onRemoveTopic={
						isTeamLeader
							? (topic) => void sendRemoveTopicFromTeam(teamPage.teamId, topic.id).then(onChanged)
							: undefined
					}
				/>
			}
			notesSection={notesSection}
			elements={TEAM_SECTIONS_ELEMENTS}
		/>
	)
}

// the shared page sections inside the page's accordion, with the line that counts the members the table leaves out
export const TEAM_SECTIONS_ELEMENTS: TeamSectionsElements = {
	...PAGE_SECTIONS_ELEMENTS,
	MoreMembersLine: ({ children }) => <p className="text-muted-foreground pb-2 pl-4 text-xs">{children}</p>,
}
