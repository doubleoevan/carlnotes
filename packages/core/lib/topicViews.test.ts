import { expect, spyOn, test } from "bun:test"
import * as viewerCountsClient from "@carlnotes/client/viewerCountsClient"
import { sendTopicViewOnce } from "./topicViews"

// send one view for repeated native or web navigation, and a separate view for another topic
test("a repeat view of one topic in one runtime sends nothing", () => {
	const sendTopicViewSpy = spyOn(viewerCountsClient, "sendTopicView").mockImplementation(() => {})
	sendTopicViewOnce("topic-1")
	sendTopicViewOnce("topic-1")
	sendTopicViewOnce("topic-2")
	expect(sendTopicViewSpy.mock.calls).toEqual([["topic-1"], ["topic-2"]])
	sendTopicViewSpy.mockRestore()
})
