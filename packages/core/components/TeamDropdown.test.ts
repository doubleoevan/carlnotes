// the team dropdown lists the user's teams and the team shown once each, alphabetically ignoring case
import { expect, test } from "bun:test"
import { toTeamDropdownTeams } from "./TeamDropdown"

test("teams list alphabetically ignoring case, with the team shown listed once", () => {
	const teams = [
		{ teamId: "team-z", name: "Zeta", avatarVersion: null },
		{ teamId: "team-a", name: "alpha", avatarVersion: null },
		{ teamId: "team-m", name: "Mid", avatarVersion: null },
	]
	expect(
		toTeamDropdownTeams(teams, { teamId: "team-m", name: "Mid", avatarVersion: null }).map(({ name }) => name),
	).toEqual(["alpha", "Mid", "Zeta"])

	// a public team the user is not on joins the list
	expect(
		toTeamDropdownTeams(teams, { teamId: "team-b", name: "Beta", avatarVersion: null }).map(({ name }) => name),
	).toEqual(["alpha", "Beta", "Mid", "Zeta"])
})
