// what the topic edit modal's teams field offers
type ComboboxOption = { value: string; label: string }

// the option value that stands for a team created on save
export const NEW_TEAM_CHOICE = "new"

// the pinned row that stands for a team created on save, kept out of the scrolling list so it always shows
export const NEW_TEAM_OPTION: ComboboxOption = { value: NEW_TEAM_CHOICE, label: "New team…" }

/**
 * Builds choices from the offered teams.
 */
export function toTeamChoices(offeredTeams: { teamId: string; name: string }[] | null): ComboboxOption[] {
	return (offeredTeams ?? []).map((team) => ({ value: team.teamId, label: team.name }))
}
