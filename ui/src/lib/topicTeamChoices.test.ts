// the topic edit modal's teams field: every led team is on offer, and the New team row is pinned beside them
import { expect, test } from "bun:test"
import { NEW_TEAM_OPTION, toTeamChoices } from "./topicTeamChoices"

// two teams the user leads
const LED_TEAMS = [
	{ teamId: "team-1", name: "Kickin it" },
	{ teamId: "team-2", name: "Hot Tub Writing club" },
]

// every led team is a choice, in the order the index returned them
test("every led team is on offer", () => {
	const teamChoices = toTeamChoices(LED_TEAMS)
	expect(teamChoices.map((choice) => choice.value)).toEqual(["team-1", "team-2"])
	expect(teamChoices.map((choice) => choice.label)).toEqual(["Kickin it", "Hot Tub Writing club"])
})

// someone who leads no team is left with the pinned row, which is the one way forward
test("no led teams leaves only the pinned new team row", () => {
	expect(toTeamChoices([])).toEqual([])
	// and the same before the teams have answered. a slow load never offers a wrong default
	expect(toTeamChoices(null)).toEqual([])
	expect(NEW_TEAM_OPTION).toEqual({ value: "new", label: "New team…" })
})
