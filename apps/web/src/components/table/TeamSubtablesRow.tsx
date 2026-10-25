import { fetchTeamPage, sendRemoveTopicFromTeam } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse, TeamSummary } from "@carlnotes/contracts/teams"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { toast } from "sonner"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { SUBTABLE_CARD_CLASS, THIN_SCROLLBAR_CLASS } from "@/lib/styleClasses"
import { TeamMembersTable } from "./TeamMembersTable"
import { TopicsTable } from "./TopicsTable"

// the subtable a teams table row can open under itself
type OpenSubtable = "topics" | "members"

// one row's subtable state, as the hook returns it
interface TeamSubtables {
	openSubtable: OpenSubtable | null
	teamPage: TeamPageResponse | null
	handleSubtableClick: (subtable: OpenSubtable) => Promise<void>
	handleSubtableChanged: () => Promise<void>
}

/**
 * Whichever subtable is open, in the same tables the team page renders.
 */
export function TeamSubtablesRow({
	teamId,
	teamRole,
	isReadOnly = false,
	openSubtable,
	teamPage,
	columnCount,
	onChanged,
}: {
	teamId: string
	// the row's role on the team: the user's own, or the profile user's on someone else's profile
	teamRole: TeamSummary["role"] | null
	// someone else's profile shows the team alone, with none of the user's own controls
	isReadOnly?: boolean
	openSubtable: OpenSubtable
	teamPage: TeamPageResponse | null
	// the row spans the table above it, whose columns depend on the read-only mode
	columnCount: number
	onChanged: () => void
}) {
	// the leader controls are the user's own. a read-only row's role is the profile user's, which grants nothing here
	const isTeamLeader = !isReadOnly && isLeaderRole(teamRole)
	return (
		<tr className="border-b">
			<td colSpan={columnCount} className="py-2">
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
								topicTooltip="Topics on this team"
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
			</td>
		</tr>
	)
}

/**
 * One row's subtable state: which is open, and the team page payload that fills it, loaded on the first open.
 */
export function useTeamSubtables(teamId: string): TeamSubtables {
	const [openSubtable, setOpenSubtable] = useState<OpenSubtable | null>(null)
	const [teamPage, setTeamPage] = useState<TeamPageResponse | null>(null)

	// the team page payload includes both the topics and the members, gated to members and invitees
	async function loadOpenTeamPage(): Promise<void> {
		const fetchTeamPageResult = await fetchTeamPage(teamId).catch(() => null)
		if (fetchTeamPageResult?.status !== "visible") {
			toast.error("Couldn't load that team.")
			setOpenSubtable(null)
			return
		}
		setTeamPage(fetchTeamPageResult.team)
	}

	// a click toggles the subtable and loads the team page on the first open
	async function handleSubtableClick(subtable: OpenSubtable): Promise<void> {
		setOpenSubtable(openSubtable === subtable ? null : subtable)
		if (teamPage === null) {
			await loadOpenTeamPage()
		}
	}

	// a change inside an open subtable refetches the team page right away
	async function handleSubtableChanged(): Promise<void> {
		setTeamPage(null)
		await loadOpenTeamPage()
	}
	return { openSubtable, teamPage, handleSubtableClick, handleSubtableChanged }
}
