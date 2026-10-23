import { expect, spyOn, test } from "bun:test"
import * as viewerCountsClient from "@carlnotes/client/viewerCountsClient"
import { sendTopicViewOnce } from "./topicViews"

// a tab that opens a topic page twice sends one view, and another topic sends its own
test("a repeat view of one topic in one tab sends nothing", () => {
	const sendTopicViewSpy = spyOn(viewerCountsClient, "sendTopicView").mockImplementation(() => {})
	sendTopicViewOnce("topic-1")
	sendTopicViewOnce("topic-1")
	sendTopicViewOnce("topic-2")
	expect(sendTopicViewSpy.mock.calls).toEqual([["topic-1"], ["topic-2"]])
	sendTopicViewSpy.mockRestore()
})
