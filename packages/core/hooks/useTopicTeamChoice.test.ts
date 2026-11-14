import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as teamClient from "@carlnotes/client/teamClient"
import { saveTopicTeams, toInitialTeamIds } from "./useTopicTeamChoice"

// restore transport spies after each failure and retry scenario
afterEach(() => mock.restore())

test("a partial team addition preserves existing access and remembers accepted writes", async () => {
	// accept one addition, then reject the next before any removal
	const addTopic = spyOn(teamClient, "sendAddTopicTeam")
		.mockResolvedValueOnce(null)
		.mockResolvedValueOnce("Team is full.")
	const removeTopic = spyOn(teamClient, "sendRemoveTopicFromTeam").mockResolvedValue(true)
	const savedTeamIds = new Set(["original"])
	await expect(
		saveTopicTeams({ topicId: "topic", desiredTeamIds: new Set(["first", "second"]), savedTeamIds }),
	).rejects.toThrow("Team is full.")
	expect(savedTeamIds).toEqual(new Set(["original", "first"]))
	expect(removeTopic).not.toHaveBeenCalled()

	// a changed selection retries against actual writes and removes the now-unselected addition
	addTopic.mockResolvedValue(null)
	await saveTopicTeams({ topicId: "topic", desiredTeamIds: new Set(["second"]), savedTeamIds })
	expect(savedTeamIds).toEqual(new Set(["second"]))
	expect(addTopic.mock.calls.map(([teamId]) => teamId)).toEqual(["first", "second", "second"])
	expect(removeTopic.mock.calls.map(([teamId]) => teamId)).toEqual(["original", "first"])
})

test("a rejected removal remains pending for retry", async () => {
	// the first removal is rejected, so its team stays saved
	const removeTopic = spyOn(teamClient, "sendRemoveTopicFromTeam").mockResolvedValueOnce(false).mockResolvedValue(true)
	const savedTeamIds = new Set(["original", "retained"])
	const options = { topicId: "topic", desiredTeamIds: new Set(["retained"]), savedTeamIds }
	await expect(saveTopicTeams(options)).rejects.toThrow("A team change")
	expect(savedTeamIds.has("original")).toBe(true)
	// the retry removes it
	await saveTopicTeams(options)
	expect(savedTeamIds).toEqual(new Set(["retained"]))
	expect(removeTopic).toHaveBeenCalledTimes(2)
})

// a new topic, or a private one that no team holds, starts on the default team, and a held or shared topic keeps its teams
test("the Team field starts on the default team unless the topic already has its teams", () => {
	const leaderTeams = [{ teamId: "newer" }, { teamId: "oldest", isDefaultTeam: true }]
	expect(toInitialTeamIds({ topic: undefined, leaderTeams, holdingLeaderTeamIds: [] })).toEqual(["oldest"])
	const privateTopic = { visibility: "private" as const, team: null, roomTeams: [] }
	expect(toInitialTeamIds({ topic: privateTopic, leaderTeams, holdingLeaderTeamIds: [] })).toEqual(["oldest"])

	// a public topic on no team, and a private topic a team holds, keep what they have
	const publicTopic = { ...privateTopic, visibility: "public" as const }
	expect(toInitialTeamIds({ topic: publicTopic, leaderTeams, holdingLeaderTeamIds: [] })).toEqual([])
	const heldTopic = { ...privateTopic, roomTeams: [{ teamId: "newer", name: "Newer" }] }
	expect(toInitialTeamIds({ topic: heldTopic, leaderTeams, holdingLeaderTeamIds: ["newer"] })).toEqual(["newer"])

	// a user who leads no team starts on none
	expect(toInitialTeamIds({ topic: undefined, leaderTeams: [], holdingLeaderTeamIds: [] })).toEqual([])
})
