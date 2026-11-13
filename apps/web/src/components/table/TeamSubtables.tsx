import { fetchTeamPage, sendRemoveTopicFromTeam } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse, TeamSummary } from "@carlnotes/contracts/teams"
import type { TeamsMembershipDetail } from "@carlnotes/core/components/TeamsMembershipTable"
import { TEAM_TOPICS_TOOLTIP } from "@carlnotes/core/lib/cardSections"
import { cn } from "@carlnotes/nightshift/classNames"
import { toast } from "sonner"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { THIN_SCROLLBAR_CLASS } from "@/lib/styleClasses"
import { SUBTABLE_CARD_CLASS } from "@/lib/tableClasses"
import { TeamMembersTable } from "./TeamMembersTable"
import { TopicsTable } from "./TopicsTable"

// what a team's subtables show: the open one, the team page that fills it, and the role that grants its controls
type TeamSubtablesProps = {
	teamId: string
	// the row's role on the team: the user's own, or the profile user's on someone else's profile
	teamRole: TeamSummary["role"] | null
	// someone else's profile shows the team alone, with none of the user's own controls
	isReadOnly?: boolean
	openSubtable: TeamsMembershipDetail
	teamPage: TeamPageResponse | null
	onChanged: () => void
}

/**
 * Whichever subtable is open, in the same tables the team page renders, on the sunken card.
 */
export function TeamSubtables({
	teamId,
	teamRole,
	isReadOnly = false,
	openSubtable,
	teamPage,
	onChanged,
}: TeamSubtablesProps) {
	// the leader controls are the user's own. a read-only row's role is the profile user's, which grants nothing here
	const isTeamLeader = !isReadOnly && isLeaderRole(teamRole)
	return (
		<div className={cn("bg-sunken overflow-x-auto rounded-lg border px-4 py-2", THIN_SCROLLBAR_CLASS)}>
			{teamPage === null && <CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />}
			{teamPage &&
				openSubtable === "topics" &&
				(teamPage.topics.length === 0 ? (
					<p className="text-muted-foreground py-2 text-sm">No topics on this team yet.</p>
				) : (
					<TopicsTable
						className={cn(SUBTABLE_CARD_CLASS, "border-0 p-0")}
						topics={teamPage.topics}
						includesNonPublicTopics
						topicTooltip={TEAM_TOPICS_TOOLTIP}
						onRemoveTopic={
							isTeamLeader
								? (topic) => void sendRemoveTopicFromTeam(teamId, topic.id).then(() => onChanged())
								: undefined
						}
					/>
				))}
			{teamPage && openSubtable === "members" && (
				<TeamMembersTable
					teamId={teamId}
					members={teamPage.members}
					hiddenMemberCount={teamPage.hiddenMemberCount}
					isTeamLeader={isTeamLeader}
					isReadOnly={isReadOnly}
					onChanged={onChanged}
				/>
			)}
		</div>
	)
}

/**
 * Returns a team's page payload for its subtables, or null with an error toast when it does not load.
 */
export async function loadTeamSubtablesPage(teamId: string): Promise<TeamPageResponse | null> {
	// the team page payload includes both the topics and the members, gated to members and invitees
	const fetchTeamPageResult = await fetchTeamPage(teamId).catch(() => null)
	if (fetchTeamPageResult?.status !== "visible") {
		toast.error("Couldn't load that team.")
		return null
	}
	return fetchTeamPageResult.team
}
