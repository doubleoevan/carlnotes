import { expect, test } from "bun:test"
import { takeNewTopicChatWelcome } from "./newTopicChatWelcome"

// the welcome opens once per launch, however many times Home renders an empty Feed
test("the new-topic chat welcome opens once", () => {
	expect(takeNewTopicChatWelcome()).toBe(true)
	expect(takeNewTopicChatWelcome()).toBe(false)
})
