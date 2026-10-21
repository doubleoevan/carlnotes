// team save tests: what the invite-link button's early create sends, and what a rejected team save shows
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as teamClient from "@carlnotes/client/teamClient"
import { createTeamForInviteLink, saveTeam, TEAM_REJECTION_REASONS } from "./saveTeam"

// the fields of a new team with two topics selected
const teamFields = { name: "Roasters", description: null, topicIds: ["topic-1", "topic-2"], isPublic: false }

// put the team client's spies back after each test
afterEach(() => {
	mock.restore()
})

// the early create holds no topics, so the final Save attaches the selection once
test("createTeamForInviteLink creates the team without its selected topics", async () => {
	const sendCreateTeamSpy = spyOn(teamClient, "sendCreateTeam").mockResolvedValue({ teamId: "team-1" })
	expect(await createTeamForInviteLink(teamFields)).toEqual({ teamId: "team-1" })
	expect(sendCreateTeamSpy).toHaveBeenCalledWith({ ...teamFields, topicIds: [] })

	// a rejected create shows its reason
	sendCreateTeamSpy.mockResolvedValue({ rejection: "failed" })
	expect(await createTeamForInviteLink(teamFields)).toEqual({ rejection: TEAM_REJECTION_REASONS.failed })
})

// a failed update is a rejection of its own, never read as a taken name
test("saveTeam shows a failed update and a taken name each as its own reason", async () => {
	const team = { teamId: "team-1", name: "Roasters", avatarVersion: null, description: null, isPublic: false }
	const sendUpdateTeamSpy = spyOn(teamClient, "sendUpdateTeam").mockResolvedValue("failed")
	const saveTeamOptions = {
		team,
		fields: { ...teamFields, topicIds: [] },
		currentTopicIds: [],
		pendingInvites: [],
		avatarFile: null,
		onTeamSaved: () => {},
	}
	expect(await saveTeam(saveTeamOptions)).toBe(TEAM_REJECTION_REASONS.failed)

	// a taken name says so, and a saved update has no rejection
	sendUpdateTeamSpy.mockResolvedValue("name-taken")
	expect(await saveTeam(saveTeamOptions)).toBe(TEAM_REJECTION_REASONS["name-taken"])
	sendUpdateTeamSpy.mockResolvedValue(null)
	expect(await saveTeam(saveTeamOptions)).toBeNull()
})
