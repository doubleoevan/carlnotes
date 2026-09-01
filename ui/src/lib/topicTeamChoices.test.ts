// the topic edit modal's teams field: every led team is on offer, and the New team row always closes the list
import { expect, test } from "bun:test"
import { toTeamChoices } from "./topicTeamChoices"

// two teams the user leads
const LED_TEAMS = [
	{ teamId: "team-1", name: "Kickin it" },
	{ teamId: "team-2", name: "Hot Tub Writing club" },
]

// every led team is a choice, in the order the index returned them
test("every led team is on offer", () => {
	const teamChoices = toTeamChoices(LED_TEAMS)
	expect(teamChoices.map((choice) => choice.value)).toEqual(["team-1", "team-2", "new"])
	expect(teamChoices.map((choice) => choice.label)).toEqual(["Kickin it", "Hot Tub Writing club", "New team…"])
})

// someone who leads no team is left with the one way forward, which is making one
test("no led teams leaves only the new team row", () => {
	expect(toTeamChoices([])).toEqual([{ value: "new", label: "New team…" }])
	// and the same before the teams have answered. a slow load never offers a wrong default
	expect(toTeamChoices(null)).toEqual([{ value: "new", label: "New team…" }])
})
