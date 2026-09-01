// the team every account gets: how it is named
import { expect, test } from "bun:test"
import { toUserTeamName } from "./teams"

// the name reads as the person's own team
test("a user's team is named for them", () => {
	expect(toUserTeamName("Warm-Bean")).toBe("Team Warm-Bean")
	// whatever the username holds is kept. the username is already unique
	expect(toUserTeamName("Seeded-Member-40")).toBe("Team Seeded-Member-40")
})
