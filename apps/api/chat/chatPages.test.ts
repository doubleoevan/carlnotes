// chat page tests: the analytics kind each page is named by
import { expect, test } from "bun:test"
import { toChatKind } from "./chatPages"

// an analytics event names which chat a page holds, for a private page and for a voice page alike
test("toChatKind names the chat a private page or a voice page holds", () => {
	expect(toChatKind({ topicId: "topic-1" })).toBe("topic")
	expect(toChatKind({ teamId: "team-1" })).toBe("team")
	expect(toChatKind({ newTopic: true })).toBe("new_topic")
	expect(toChatKind({ kind: "topic", topicId: "topic-1" })).toBe("topic")
	expect(toChatKind({ kind: "newTopic" })).toBe("new_topic")
	expect(toChatKind({ kind: "room", topicId: null, teamId: "team-1" })).toBe("room")
})
