import { expect, test } from "bun:test"
import { topicMemoryFeedbackPayload, toTopicMemoryPageNumber } from "./topicMemories"

test("a page past the Journal's last page is its last page, and an empty Journal is on page one", () => {
	expect(toTopicMemoryPageNumber(1, 3)).toBe(1)
	expect(toTopicMemoryPageNumber(3, 3)).toBe(3)
	expect(toTopicMemoryPageNumber(9, 3)).toBe(3)
	expect(toTopicMemoryPageNumber(4, 0)).toBe(1)
})

test("a rating's note is trimmed, limited to 400 characters, and may be left out", () => {
	// a note within the limit, with the space around it removed
	expect(topicMemoryFeedbackPayload.parse({ rating: "down", note: "  wrong year  " })).toEqual({
		rating: "down",
		note: "wrong year",
	})
	expect(topicMemoryFeedbackPayload.parse({ rating: null })).toEqual({ rating: null })

	// a longer note, a rating that is no thumb, and a control character are each rejected
	expect(topicMemoryFeedbackPayload.safeParse({ rating: "up", note: "x".repeat(401) }).success).toBe(false)
	expect(topicMemoryFeedbackPayload.safeParse({ rating: "sideways" }).success).toBe(false)
	expect(topicMemoryFeedbackPayload.safeParse({ rating: "down", note: "A\u0007B" }).success).toBe(false)
})
