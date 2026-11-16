// deterministic cleanup groups and the order in which unprotected active takeaways age out
import { TOPIC_MEMORY_ACTIVE_LIMIT } from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_RECENCY_DECAY } from "@carlnotes/contracts/topicMemoryWork"
import { toTopicMemorySimilarity, toTopicMemorySimilarityAction } from "./topicMemoryOperations"

type CleanupMemory = {
	id: string
	text: string
	isActive: boolean
	embedding: number[]
	embeddingModel: string
	// only an active flag and its recorded match qualify at the lower threshold
	needsReview: boolean
	reviewMatchId: string | null
	personMatchKey: string | null
	factDate: string | null
	isSavedTakeaway: boolean
	hasCorrection: boolean
	firstSeenAt: Date
}

/** Combines a group only when every pair is near-identical or confirmed as duplicate. */
export function toTopicMemoryCleanupGroups<Memory extends CleanupMemory>(
	memories: Memory[],
	confirmedPairs: ReadonlySet<string>,
): Memory[][] {
	// preserve corrections first, then saved takeaways, then the earliest phrasing. the merge preserves everyone's provenance
	const ordered = [...memories].sort(
		(first, second) =>
			Number(second.isActive) - Number(first.isActive) ||
			Number(second.hasCorrection) - Number(first.hasCorrection) ||
			Number(second.isSavedTakeaway) - Number(first.isSavedTakeaway) ||
			first.firstSeenAt.getTime() - second.firstSeenAt.getTime() ||
			first.id.localeCompare(second.id),
	)
	const groups: Memory[][] = []
	for (const memory of ordered) {
		const group = groups.find(
			(members) =>
				members[0]?.isActive && members.every((member) => isTopicMemoryDuplicate(member, memory, confirmedPairs)),
		)
		if (group) {
			group.push(memory)
		} else {
			groups.push([memory])
		}
	}
	return groups
}

// the same pair has one identity whichever row survives
export function toTopicMemoryPairId(first: string, second: string): string {
	return JSON.stringify([first, second].sort())
}

/** Two explicit event dates must match before claims can describe the same event. */
export function canShareTopicMemoryEvent(first: string | null, second: string | null): boolean {
	return first === null || second === null || first === second
}

function isTopicMemoryDuplicate(
	first: CleanupMemory,
	second: CleanupMemory,
	confirmedPairs: ReadonlySet<string>,
): boolean {
	// overlapping names or text cannot combine facts with incompatible identities or event dates
	if (first.personMatchKey !== second.personMatchKey || !canShareTopicMemoryEvent(first.factDate, second.factDate)) {
		return false
	}
	return (
		confirmedPairs.has(toTopicMemoryPairId(first.id, second.id)) ||
		(first.embeddingModel === second.embeddingModel &&
			toTopicMemorySimilarityAction(toTopicMemorySimilarity(first.embedding, second.embedding), [
				first.text,
				second.text,
			]) === "merge")
	)
}

/** Returns the ids to retire after dedup. Saved takeaways and corrections occupy protected slots. */
export function toEvictedTopicMemoryIds(
	memories: {
		id: string
		importance: number
		scansSinceLastSeen: number
		isSavedTakeaway: boolean
		hasCorrection: boolean
	}[],
): string[] {
	const excess = memories.length - TOPIC_MEMORY_ACTIVE_LIMIT
	if (excess <= 0) {
		return []
	}

	// evict the lowest decay-adjusted importance first, with a stable tie-break across retries
	return memories
		.filter(({ isSavedTakeaway, hasCorrection }) => !isSavedTakeaway && !hasCorrection)
		.map(({ id, importance, scansSinceLastSeen }) => ({
			id,
			score: importance * TOPIC_MEMORY_RECENCY_DECAY ** scansSinceLastSeen,
		}))
		.sort((first, second) => first.score - second.score || first.id.localeCompare(second.id))
		.slice(0, excess)
		.map(({ id }) => id)
}
