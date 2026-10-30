// topic contract tests: the addable topics response parses a topic list and rejects one with no name
import { expect, test } from "bun:test"
import { addableTopicsResponse } from "./topics"

// the addable topics response parses each topic's id and name, and rejects a topic with no name
test("addableTopicsResponse parses a topic list and rejects a topic with no name", () => {
	const topics = [{ id: "topic-1", name: "Better coffee at home" }]
	expect(addableTopicsResponse.parse({ topics })).toEqual({ topics })
	expect(addableTopicsResponse.safeParse({ topics: [{ id: "topic-1" }] }).success).toBe(false)
})
