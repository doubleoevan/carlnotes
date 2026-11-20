import type { TopicMemoryClaimType } from "./topicMemories"

// the Journal workers' queue, backfill, and rules for updating topic memories
export const TOPIC_MEMORY_TASK_QUEUE = "topic-memories"
export const TOPIC_MEMORY_FACT_FORMAT_VERSION = 6
export const TOPIC_MEMORY_BACKFILL_WORKFLOW = "backfillTopicMemoriesWorkflow"
export type TopicMemoryBackfillSummary = { updated: number; skipped: number; paused: number; failed: number }

// leave time for a cancelled activity to release its lease before Temporal retries it
export const TOPIC_MEMORY_ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000
export const TOPIC_MEMORY_ATTEMPT_DEADLINE_MS = 4 * 60 * 1000

// no model call waits to try again in the attempt's last half minute, which a call started then needs to finish
export const TOPIC_MEMORY_RETRY_MARGIN_MS = 30 * 1000

// how many attempts one Scan's update gets before its topic memories are left for a later Scan
export const TOPIC_MEMORY_UPDATE_ATTEMPTS = 3

export const TOPIC_MEMORY_FINDING_GROUP_SIMILARITY = 0.92
export const TOPIC_MEMORY_GROUP_SIMILARITY = 0.8
export const TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT = 100
export const TOPIC_MEMORY_RECENCY_DECAY = 0.9
export const TOPIC_MEMORY_NEIGHBOR_LIMIT = 5
export const TOPIC_MEMORY_PROMPT_LIMIT = 20

// how many of the Findings that support a topic memory its row keeps, the newest last
export const TOPIC_MEMORY_FINDING_LIMIT = 30

/**
 * Returns a topic memory's Finding ids with the added ones after them, each once, cut to the newest it keeps.
 */
export function toNewestTopicMemoryFindingIds(findingIds: string[], addedFindingIds: string[]): string[] {
	return [...new Set([...findingIds, ...addedFindingIds])].slice(-TOPIC_MEMORY_FINDING_LIMIT)
}

/** Mutable exact keys require a date and a claim type with a specific slot. */
export function hasExactTopicMemoryKey(factDate: string | null, claimType: TopicMemoryClaimType | null): boolean {
	return Boolean(factDate?.length === 10 && claimType && claimType !== "other" && claimType !== "statistic")
}

/** A missing date or coarser precision can overlap a more precise event date. */
export function areTopicMemoryDatesCompatible(first: string | null, second: string | null): boolean {
	return !first || !second || first === second || first.startsWith(`${second}-`) || second.startsWith(`${first}-`)
}

/** Chooses the more precise of two compatible dates. */
export function toMostPreciseTopicMemoryDate(first: string | null, second: string | null): string | null {
	return (second?.length ?? 0) > (first?.length ?? 0) ? second : first
}

type TopicMemoryCombineKey = { subject: string | null; claimType: TopicMemoryClaimType | null; value: string | null }

/** Requires the same subject and type and a shared complete value before asking the model. */
export function canModelCombineTopicMemories(first: TopicMemoryCombineKey, second: TopicMemoryCombineKey): boolean {
	// both claims need a subject, a type, and a value, and the first two must match
	const hasSameSubject = Boolean(first.subject) && first.subject === second.subject
	const hasSameClaimType = Boolean(first.claimType) && first.claimType === second.claimType
	if (!hasSameSubject || !hasSameClaimType || !first.value || !second.value) {
		return false
	}

	// preserve numeric tokens, so one digit of a date or amount cannot satisfy containment
	const firstValue = toTopicMemoryValueTokens(first.value)
	const secondValue = toTopicMemoryValueTokens(second.value)
	return Boolean(firstValue && secondValue && (firstValue.includes(secondValue) || secondValue.includes(firstValue)))
}

function toTopicMemoryValueTokens(value: string): string {
	const tokens = value.match(/[\p{L}\p{M}]+|\p{N}+(?:[.,]\p{N}+)*|[^\p{P}\s]/gu) ?? []
	return tokens.length ? ` ${tokens.join(" ")} ` : ""
}
