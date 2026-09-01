// what the topic edit modal's teams field offers
import type { ComboboxOption } from "@/components/common/MultiCombobox"

// the option value that stands for a team created on save
export const NEW_TEAM_CHOICE = "new"

// the pinned row that stands for a team created on save, kept out of the scrolling list so it always shows
export const NEW_TEAM_OPTION: ComboboxOption = { value: NEW_TEAM_CHOICE, label: "New team…" }

/**
 * What the teams field offers: every team the user leads. A non-private topic must keep at least one team,
 * either one of these or the pinned New team row.
 */
export function toTeamChoices(offeredTeams: { teamId: string; name: string }[] | null): ComboboxOption[] {
	return (offeredTeams ?? []).map((team) => ({ value: team.teamId, label: team.name }))
}
