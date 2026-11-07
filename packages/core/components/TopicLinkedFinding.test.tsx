import { expect, test } from "bun:test"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { TopicLinkedFinding } from "./TopicLinkedFinding"

// only Findings from the authorized payload can reach the details adapter
const topic = { id: "current-topic", findings: [{ findingId: "kept", title: "Kept Finding" }] } as TopicResponse
const props = {
	topic,
	Details: () => null,
	onClose: () => {},
	topicFeedHandlers: {
		openTopicFinding: () => {},
		consumeTopicFinding: () => {},
		rateTopicFinding: () => {},
		bookmarkTopicFinding: () => {},
		keepTopicFindingReactions: () => {},
	},
}

test("a linked Finding uses the authorized Topic payload and its existing action handlers", () => {
	const result = TopicLinkedFinding({ ...props, findingId: "kept" })
	expect(result?.props.resource).toBe(topic.findings[0])
	expect(result?.props.topic).toBe(topic)
	expect(result?.props.topicFeedHandlers).toBe(props.topicFeedHandlers)
})

test("missing, cross-Topic, and malformed links cannot open Finding details", () => {
	for (const findingId of [null, undefined, ["kept"], { id: "kept" }, "another-topics-finding"]) {
		expect(TopicLinkedFinding({ ...props, findingId })).toBeNull()
	}
	expect(TopicLinkedFinding({ ...props, topic: { ...topic, findings: [] }, findingId: "kept" })).toBeNull()
})
