// a poll that reads the same topic page again keeps the shown topic itself, so React renders nothing
import { expect, test } from "bun:test"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { toReloadedTopic } from "./useTopicPagePayload"

test("an unchanged poll returns the shown topic itself, so the page renders nothing", () => {
	// the topic shown after an earlier poll, and a poll's fresh copy of the same page
	const loadedTopic = toTestTopicResponse({ id: "topic-1" })
	const polledTopic = structuredClone(loadedTopic)
	const pollOptions = { isPoll: true, isRelatedTopicsSeparate: false }
	const shownTopic = toReloadedTopic({ ...pollOptions, previousTopic: loadedTopic, fetchedTopic: polledTopic })
	const reloadOptions = { ...pollOptions, previousTopic: shownTopic }

	// the same page is the same object, which a state setter skips
	expect(toReloadedTopic({ ...reloadOptions, fetchedTopic: polledTopic })).toBe(shownTopic)

	// a changed page is a new object that keeps the unchanged parts of the shown one
	const changedTopic = toReloadedTopic({ ...reloadOptions, fetchedTopic: { ...polledTopic, name: "Renamed" } })
	expect(changedTopic).not.toBe(shownTopic)
	expect(changedTopic?.name).toBe("Renamed")
	expect(changedTopic?.scans).toBe(shownTopic?.scans)
})
