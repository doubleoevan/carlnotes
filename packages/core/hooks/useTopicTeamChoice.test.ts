import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as teamClient from "@carlnotes/client/teamClient"
import { isTopicHeldElsewhere, saveTopicTeams } from "./useTopicTeamChoice"

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

test("a topic another team owns needs no team of the user's", () => {
	// a member who leads only their own team edits a topic that a different team owns
	const topic = { team: { teamId: "other", name: "Other", isPublic: true }, roomTeams: [] }
	expect(isTopicHeldElsewhere(topic, [{ teamId: "mine" }])).toBe(true)

	// an owning team the user leads is theirs to keep or drop, so it alone does not count
	expect(isTopicHeldElsewhere(topic, [{ teamId: "other" }])).toBe(false)

	// a topic no team holds needs a team picked
	expect(isTopicHeldElsewhere({ team: null, roomTeams: [] }, [{ teamId: "mine" }])).toBe(false)
})
