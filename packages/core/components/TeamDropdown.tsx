// the team dropdown: the user's teams and the team shown, each with its avatar, in alphabetical order ignoring case,
// with the team shown selected
import type { TeamIdentity } from "@carlnotes/contracts/teamIdentity"
import { toAlphabeticalTeams } from "@carlnotes/contracts/teams"
import type { ComponentType } from "react"
import type { DashboardSelectProps } from "../lib/dashboardCharts"

// a team the dropdown lists
type TeamDropdownTeam = TeamIdentity

// each app's select, highlighted in the primary color if asked, and the small team avatar beside each team's name
export type TeamDropdownElements = {
	Select: ComponentType<DashboardSelectProps>
	TeamAvatar: ComponentType<{ team: TeamIdentity }>
}

// the user's teams, the team shown, and what choosing a team does
export type TeamDropdownProps = {
	teams: TeamDropdownTeam[]
	currentTeam: TeamDropdownTeam
	onTeamChange: (teamId: string) => void
}

/**
 * Returns the dropdown's teams: the user's teams and the team shown, once each, in alphabetical order ignoring case.
 */
export function toTeamDropdownTeams(teams: TeamDropdownTeam[], currentTeam: TeamDropdownTeam): TeamDropdownTeam[] {
	const teamsById = new Map([...teams, currentTeam].map((team) => [team.teamId, team]))
	return toAlphabeticalTeams([...teamsById.values()])
}

/**
 * Shows the team dropdown highlighted, or nothing for a user with no team of their own.
 */
export function TeamDropdown({
	teams,
	currentTeam,
	onTeamChange,
	elements: { Select, TeamAvatar },
}: TeamDropdownProps & { elements: TeamDropdownElements }) {
	if (teams.length === 0) {
		return null
	}
	const choices = toTeamDropdownTeams(teams, currentTeam).map((team) => ({
		value: team.teamId,
		label: team.name,
		icon: <TeamAvatar team={team} />,
	}))
	return <Select label="Team" value={currentTeam.teamId} choices={choices} onChange={onTeamChange} isHighlighted />
}
