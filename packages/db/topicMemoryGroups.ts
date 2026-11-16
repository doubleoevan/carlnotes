// computes reversible groups from rows the caller is already allowed to read
import type { TopicMemoryClaimType } from "@carlnotes/contracts/topicMemories"
import {
	areTopicMemoryDatesCompatible,
	hasExactTopicMemoryKey,
	TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT,
	TOPIC_MEMORY_GROUP_SIMILARITY,
} from "@carlnotes/contracts/topicMemoryWork"
import { TOPIC_MEMORY_EMBEDDING_MODEL } from "./schema/topicMemories"

type GroupableTopicMemory = {
	id: string
	subject: string | null
	claimType: TopicMemoryClaimType | null
	value: string | null
	factDate: string | null
	embedding: number[] | null
	embeddingModel: string
}

/** Keeps the highest-ranked member first and requires every member to match every other. */
export function groupTopicMemories<Row extends GroupableTopicMemory>(
	rows: Row[],
	prefer?: (first: Row, second: Row) => number,
): Row[][] {
	// compare only claims with the same subject, claim type and normalized value
	const groups: Row[][] = []
	const buckets = new Map<string, Row[][]>()
	const bucketSizes = new Map<string, number>()
	const ranks = new Map(rows.map(({ id }, rank) => [id, rank]))
	for (const row of rows.toSorted((a, b) => a.id.localeCompare(b.id))) {
		const key = row.subject && row.claimType && row.value && JSON.stringify([row.subject, row.claimType, row.value])
		if (!key || !row.embedding || row.embeddingModel !== TOPIC_MEMORY_EMBEDDING_MODEL) {
			groups.push([row])
			continue
		}

		// keep conflicting dates apart, even when an undated row could link them
		const size = bucketSizes.get(key) ?? 0
		bucketSizes.set(key, size + 1)
		if (size >= TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT) {
			groups.push([row])
			continue
		}

		const peers = buckets.get(key) ?? []
		const group = peers.find((members) => members.every((member) => canGroupTopicMemories(row, member)))
		if (group) {
			group.push(row)
			continue
		}
		const newGroup = [row]
		buckets.set(key, [...peers, newGroup])
		groups.push(newGroup)
	}
	// rank the same groups for the current caller after their membership is fixed
	const rank = (row?: Row): number => (row ? (ranks.get(row.id) ?? 0) : 0)
	for (const group of groups) {
		group.sort((first, second) => rank(first) - rank(second))
	}
	groups.sort((first, second) => rank(first[0]) - rank(second[0]))
	return prefer ? groups.map((group) => group.toSorted(prefer)) : groups
}

function canGroupTopicMemories(first: GroupableTopicMemory, second: GroupableTopicMemory): boolean {
	if (!first.embedding || !second.embedding || !areTopicMemoryDatesCompatible(first.factDate, second.factDate)) {
		return false
	}
	if (
		hasExactTopicMemoryKey(first.factDate, first.claimType) &&
		hasExactTopicMemoryKey(second.factDate, second.claimType)
	) {
		return false
	}
	return toTopicMemorySimilarity(first.embedding, second.embedding) >= TOPIC_MEMORY_GROUP_SIMILARITY
}

/** Compares vectors from one embedding space, including non-unit inputs. */
export function toTopicMemorySimilarity(first: number[], second: number[]): number {
	if (first.length !== second.length || first.length === 0) {
		return -1
	}

	// accumulate both lengths as well as the dot product
	let dot = 0
	let firstLength = 0
	let secondLength = 0
	for (const [index, value] of first.entries()) {
		const other = second[index] ?? 0
		dot += value * other
		firstLength += value * value
		secondLength += other * other
	}
	const denominator = Math.sqrt(firstLength * secondLength)
	return denominator > 0 ? dot / denominator : -1
}

/** Prefers the newest observation, then the fullest wording with a stable tie. */
export function preferTopicMemoryRepresentative(
	first: { id: string; lastSeenAt: Date; text: string },
	second: { id: string; lastSeenAt: Date; text: string },
): number {
	return (
		second.lastSeenAt.getTime() - first.lastSeenAt.getTime() ||
		second.text.length - first.text.length ||
		first.id.localeCompare(second.id)
	)
}
