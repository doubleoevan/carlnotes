// what the topic edit modal's teams field offers
type ComboboxOption = { value: string; label: string }

// the option value that stands for a team created on save
export const NEW_TEAM_CHOICE = "new"

// the pinned row that stands for a team created on save, kept out of the scrolling list so it always shows
export const NEW_TEAM_OPTION: ComboboxOption = { value: NEW_TEAM_CHOICE, label: "New team…" }

// a team the field offers, and whether it is the user's default team
export type OfferedTeam = { teamId: string; name: string; isDefaultTeam?: boolean }

/**
 * Builds choices from the offered teams, with the default team marked.
 */
export function toTeamChoices(offeredTeams: OfferedTeam[] | null): ComboboxOption[] {
	return (offeredTeams ?? []).map((team) => ({
		value: team.teamId,
		label: team.isDefaultTeam ? `${team.name} (default)` : team.name,
	}))
}

/**
 * Returns the message a save shows if it adds the topic to the default team.
 */
export function toDefaultTeamAddedText(defaultTeamName: string): string {
	return `Added to ${defaultTeamName}, your default team.`
}
