import { expect, spyOn, test } from "bun:test"
import * as viewerCountsClient from "@carlnotes/client/viewerCountsClient"
import { sendProfileViewOnce, sendTeamViewOnce, sendTopicViewOnce } from "./pageViews"

// send one view for repeated native or web navigation, and a separate view for another topic
test("a repeat view of one topic in one runtime sends nothing", () => {
	const sendTopicViewSpy = spyOn(viewerCountsClient, "sendTopicView").mockImplementation(() => {})
	sendTopicViewOnce("topic-1")
	sendTopicViewOnce("topic-1")
	sendTopicViewOnce("topic-2")
	expect(sendTopicViewSpy.mock.calls).toEqual([["topic-1"], ["topic-2"]])
	sendTopicViewSpy.mockRestore()
})

// a profile and a team that share an id are separate pages, and each sends its own view once
test("a profile and a team with one id each send one view", () => {
	const sendProfileViewSpy = spyOn(viewerCountsClient, "sendProfileView").mockImplementation(() => {})
	const sendTeamViewSpy = spyOn(viewerCountsClient, "sendTeamView").mockImplementation(() => {})
	sendProfileViewOnce("shared-id")
	sendProfileViewOnce("shared-id")
	sendTeamViewOnce("shared-id")
	sendTeamViewOnce("shared-id")

	// one view each, whatever the repeat
	expect(sendProfileViewSpy.mock.calls).toEqual([["shared-id"]])
	expect(sendTeamViewSpy.mock.calls).toEqual([["shared-id"]])
	sendProfileViewSpy.mockRestore()
	sendTeamViewSpy.mockRestore()
})
