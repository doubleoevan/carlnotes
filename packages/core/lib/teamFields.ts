import type { TeamIdentity } from "@carlnotes/contracts/teamIdentity"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { toCountDetails } from "./detailsLine"
import { toCountLabel } from "./labels"

// the label of the team page's button that opens the invite dialog for a member
export const ADD_TEAM_MEMBER_LABEL = "Add Member"

// both editors stage invitations until the team is saved
export type PendingInvite = { email: string } | { username: string }
export type TopicOption = { id: string; name: string }
export type EditedTeam = Pick<TeamIdentity, "teamId" | "name" | "avatarVersion"> & {
	description: string | null
	isPublic: boolean
}

// what the team page's details line reads of the page, and the count its notes section reports once the notes load
type ToTeamDetailsOptions = {
	teamPage: Pick<TeamPageResponse, "members" | "hiddenMemberCount" | "topics" | "podcastEpisodeCards">
	noteCount: number | null | undefined
}

/**
 * Returns the details of the line under a team page's title: how many members it has and how many topics the reader
 * may open, then how many podcast episode cards and notes the page lists, each left out at zero. The members are the
 * active ones, shown or not, so a join request never raises the count.
 */
export function toTeamDetails({ teamPage, noteCount }: ToTeamDetailsOptions): string[] {
	const memberCount = teamPage.members.filter((member) => member.isActive).length + teamPage.hiddenMemberCount
	return [
		toCountLabel(memberCount, "member"),
		toCountLabel(teamPage.topics.length, "topic"),
		...toCountDetails([
			{ count: teamPage.podcastEpisodeCards.length, noun: "podcast episode" },
			{ count: noteCount, noun: "note" },
		]),
	]
}
