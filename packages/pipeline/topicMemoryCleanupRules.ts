// orders unprotected active topic memories by Scan recency
import { TOPIC_MEMORY_ACTIVE_LIMIT } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_RECENCY_DECAY } from "@carlnotes/contracts/topicMemoryWork"

/**
 * Returns the ids to retire after the Scan writes. Saved topic memories and corrections occupy protected slots.
 */
export function toEvictedTopicMemoryIds(
	memories: {
		id: string
		importance: number
		scansSinceLastSeen: number
		isSavedTopicMemory: boolean
		hasCorrection: boolean
	}[],
): string[] {
	const excess = memories.length - TOPIC_MEMORY_ACTIVE_LIMIT
	if (excess <= 0) {
		return []
	}

	// evict the lowest decay-adjusted importance first, with a stable tie-break across retries
	return memories
		.filter(({ isSavedTopicMemory, hasCorrection }) => !isSavedTopicMemory && !hasCorrection)
		.map(({ id, importance, scansSinceLastSeen }) => ({
			id,
			score: importance * TOPIC_MEMORY_RECENCY_DECAY ** scansSinceLastSeen,
		}))
		.sort((first, second) => first.score - second.score || first.id.localeCompare(second.id))
		.slice(0, excess)
		.map(({ id }) => id)
}
