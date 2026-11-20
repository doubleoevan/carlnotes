import { expect, test } from "bun:test"
import { TOPIC_MEMORY_FINDING_LIMIT, toNewestTopicMemoryFindingIds } from "./topicMemoryWork"

test("a topic memory keeps each supporting Finding once, the added ones last", () => {
	expect(toNewestTopicMemoryFindingIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"])
	expect(toNewestTopicMemoryFindingIds([], [])).toEqual([])
})

test("a topic memory past its Finding limit keeps the newest and drops the oldest", () => {
	// a row at the limit gains two more
	const findingIds = Array.from({ length: TOPIC_MEMORY_FINDING_LIMIT }, (_, index) => `finding-${index}`)
	const newestFindingIds = toNewestTopicMemoryFindingIds(findingIds, ["new-1", "new-2"])
	expect(newestFindingIds).toHaveLength(TOPIC_MEMORY_FINDING_LIMIT)
	expect(newestFindingIds.slice(0, 2)).toEqual(["finding-2", "finding-3"])
	expect(newestFindingIds.slice(-2)).toEqual(["new-1", "new-2"])
})
