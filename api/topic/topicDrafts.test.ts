// tests for reading a stored topic draft back
import { expect, test } from "bun:test"
import { EMPTY_TOPIC_DRAFT, topicDraftPayload } from "@shared/contracts"

// check a topic draft saved before the schedule fields existed still parses
test("a topic draft saved without the schedule fields reads back with their defaults", () => {
	const { scheduledTime, scheduledDayOfWeek, ...topicDraftWithoutSchedule } = { ...EMPTY_TOPIC_DRAFT, name: "Hoops" }
	const topicDraftResult = topicDraftPayload.safeParse(topicDraftWithoutSchedule)
	expect(topicDraftResult.success).toBe(true)
	expect(topicDraftResult.data).toEqual({ ...EMPTY_TOPIC_DRAFT, name: "Hoops" })
})

test("a stored value that is not a topic draft is rejected", () => {
	expect(topicDraftPayload.safeParse(undefined).success).toBe(false)
	expect(topicDraftPayload.safeParse({ name: 12 }).success).toBe(false)
})
