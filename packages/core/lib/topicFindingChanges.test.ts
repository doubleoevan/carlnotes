// a change to a list's rows
import { expect, test } from "bun:test"
import { applyUpdatesFindingChanges } from "./topicFindingChanges"
import { UPDATES_STORY } from "./updatesStories"

test("a change reaches its row, and the list keeps its order and its other rows", () => {
	const [firstFinding, secondFinding] = UPDATES_STORY.findings
	if (!firstFinding || !secondFinding) {
		throw new Error("Expected two Findings")
	}
	const changedUpdates = applyUpdatesFindingChanges(UPDATES_STORY, [
		{ findingId: secondFinding.findingId, kind: "bookmark", isBookmarked: true },
	])
	expect(changedUpdates.findings.map(({ findingId }) => findingId)).toEqual(
		UPDATES_STORY.findings.map(({ findingId }) => findingId),
	)
	expect(changedUpdates.findings[0]).toBe(firstFinding)
	expect(changedUpdates.findings[1]).toMatchObject({ isBookmarked: true, topicName: secondFinding.topicName })
})

test("no change returns the same list", () => {
	expect(applyUpdatesFindingChanges(UPDATES_STORY, [])).toBe(UPDATES_STORY)
})
