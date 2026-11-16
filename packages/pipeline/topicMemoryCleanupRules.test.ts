import { expect, test } from "bun:test"
import { TOPIC_MEMORY_ACTIVE_LIMIT } from "@carlnotes/contracts/topicMemories"
import { toEvictedTopicMemoryIds } from "./topicMemoryCleanupRules"

test("eviction uses Scan count recency while exempting pins and corrections", () => {
	const fresh = { id: "fresh", importance: 0.3, scansSinceLastSeen: 0, isSavedTopicMemory: false, hasCorrection: false }
	const old = { ...fresh, id: "old", importance: 0.9, scansSinceLastSeen: 30 }
	const protectedRows = [
		{ ...old, id: "upvote", isSavedTopicMemory: true },
		{ ...old, id: "correction", hasCorrection: true },
	]
	const fillers = Array.from({ length: TOPIC_MEMORY_ACTIVE_LIMIT - 2 }, (_, i) => ({
		...fresh,
		id: `filler-${i}`,
		importance: 1,
	}))
	expect(toEvictedTopicMemoryIds([...fillers, ...protectedRows, fresh, old])).toEqual(["old", "fresh"])
})
