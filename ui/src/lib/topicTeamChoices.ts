// what the topic edit modal's teams field offers
import type { ComboboxOption } from "@/components/common/MultiCombobox"

// the option value that stands for a team created on save
export const NEW_TEAM_CHOICE = "new"

/**
 * What the teams field offers: every team the user leads, ending in the New team row that creates one on
 * save. A non-private topic must keep at least one team.
 */
export function toTeamChoices(offeredTeams: { teamId: string; name: string }[] | null): ComboboxOption[] {
	// the user's leader teams first, then the row that stands for a team made on save
	const teamOptions = (offeredTeams ?? []).map((team) => ({ value: team.teamId, label: team.name }))
	return [...teamOptions, { value: NEW_TEAM_CHOICE, label: "New team…" }]
}
