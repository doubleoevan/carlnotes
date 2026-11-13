import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { TeamSections as SharedTeamSections, type TeamSectionsElements } from "@carlnotes/core/components/TeamSections"
import type { ReactNode } from "react"
import { PAGE_SECTIONS_ELEMENTS } from "@/components/common/pageSectionsElements"
import { Text } from "@/components/primitives/text"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { usePageMutation } from "@/hooks/usePageMutation"
import { removeTopicFromTeam } from "@/teamTopicRemoval"

/**
 * Renders a team screen's sections: the card sections, the members, the topics with a leader's remove, and the notes
 * section the screen passes.
 */
export function TeamSections({
	teamPage,
	notesSection,
	onReload,
}: {
	teamPage: TeamPageResponse
	notesSection: ReactNode
	onReload: () => void
}) {
	const { teamId } = teamPage
	const isTeamLeader = isLeaderRole(teamPage.role)
	const mutation = usePageMutation(onReload)
	return (
		<>
			<SharedTeamSections
				teamPage={teamPage}
				membersTable={
					<TeamMembersTable
						teamId={teamId}
						members={teamPage.members}
						hiddenMemberCount={teamPage.hiddenMemberCount}
						isTeamLeader={isTeamLeader}
						onChanged={onReload}
					/>
				}
				topicsTable={
					<TopicsTable
						topics={teamPage.topics}
						includesNonPublicTopics={Boolean(teamPage.role)}
						onRemoveTopic={
							isTeamLeader
								? (topic) => void mutation.run(() => removeTopicFromTeam({ teamId, topicId: topic.id }))
								: undefined
						}
					/>
				}
				notesSection={notesSection}
				elements={TEAM_SECTIONS_ELEMENTS}
			/>
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</>
	)
}

// the shared page sections, with the line that counts the members the table leaves out
const TEAM_SECTIONS_ELEMENTS: TeamSectionsElements = {
	...PAGE_SECTIONS_ELEMENTS,
	MoreMembersLine: ({ children }) => <Text className="pb-2 pl-4 text-xs text-muted-foreground">{children}</Text>,
}
