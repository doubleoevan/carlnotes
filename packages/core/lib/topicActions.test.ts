import { describe, expect, test } from "bun:test"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { isManualScanShown, toTopicActionLayout } from "./topicActions"

describe("shared Topic actions", () => {
	test("keeps Brew available to its owner and Team Up on the left", () => {
		const topic = toTestTopicResponse({ manualScansRemaining: 0 })
		const layout = toTopicActionLayout({ topic, isSignedIn: true, isBookmarkedView: false, isJoinable: false })
		expect(isManualScanShown(topic)).toBe(true)
		expect(layout).toMatchObject({
			isNewTopicCallToAction: false,
			isAddTopicToTeamOnLeft: true,
			isSubscribeInMenu: false,
		})
	})

	test("moves Team Up into the menu when a reader may join the owning team", () => {
		const topic = toTestTopicResponse({ isTopicOwner: false, manualScansRemaining: null })
		const layout = toTopicActionLayout({ topic, isSignedIn: true, isBookmarkedView: false, isJoinable: true })
		expect(layout).toMatchObject({
			isJoinOnLeft: true,
			isNewTopicCallToAction: true,
			isAddTopicToTeamInMenu: true,
			isAddTopicToTeamOnLeft: false,
			isSubscribeInMenu: true,
		})
	})

	test("does not offer a private Topic's follow or team assignment to another account", () => {
		const topic = toTestTopicResponse({ isTopicOwner: false, visibility: "private", manualScansRemaining: null })
		const layout = toTopicActionLayout({ topic, isSignedIn: true, isBookmarkedView: false, isJoinable: false })
		expect(layout).toMatchObject({
			isSubscribeInMenu: false,
			isAddTopicToTeamOnLeft: false,
			isAddTopicToTeamInMenu: false,
		})
	})
})
