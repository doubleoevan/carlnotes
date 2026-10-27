import { fetchTeamPage } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { useEffect, useState } from "react"
import { toCurrentChatGuard } from "../stores/chatConversationStore"

/**
 * Loads the room's active member usernames and the user's leader status.
 */
export function useRoomMembers(
	teamId: string,
	userId: string | undefined,
	loadedTeam?: TeamPageResponse,
): { memberUsernames: string[]; isTeamLeader: boolean } {
	// reuse the loaded Team when it matches this room
	const matchingTeam = loadedTeam?.teamId === teamId ? loadedTeam : undefined
	const [team, setTeam] = useState<TeamPageResponse | null>(matchingTeam ?? null)
	useEffect(() => {
		if (matchingTeam) {
			setTeam(matchingTeam)
			return
		}
		// load members for the selected account and Team
		let isStale = false
		const isCurrentChat = toCurrentChatGuard()
		setTeam(null)
		fetchTeamPage(teamId)
			.then((teamPage) => {
				if (isStale || !isCurrentChat()) {
					return
				}
				setTeam(teamPage.status === "visible" ? teamPage.team : null)
			})
			.catch(() => {
				if (!isStale && isCurrentChat()) {
					setTeam(null)
				}
			})
		return () => {
			isStale = true
		}
	}, [teamId, matchingTeam])
	const memberUsernames = (team?.members ?? [])
		.filter((member) => member.isActive && member.userId !== userId)
		.map((member) => member.username)
		.sort()
	return { memberUsernames, isTeamLeader: isLeaderRole(team?.role) }
}
