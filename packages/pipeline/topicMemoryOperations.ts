// the model proposes facts for a cluster. code owns identity and lifecycle
import { CONTROL_CHARACTER_PATTERN } from "@carlnotes/contracts/socialText"
import {
	TOPIC_MEMORY_TEXT_LIMIT,
	type TopicMemoryPerson,
	topicMemoryKinds,
	topicMemoryPerson,
} from "@carlnotes/contracts/topicMemories"
import {
	TOPIC_MEMORY_CLUSTER_SIMILARITY,
	TOPIC_MEMORY_MERGE_SIMILARITY,
	TOPIC_MEMORY_REVIEW_SIMILARITY,
} from "@carlnotes/contracts/topicMemoryWork"
import { z } from "zod"

const factFields = z.object({
	text: z.string().trim().min(1).max(TOPIC_MEMORY_TEXT_LIMIT),
	importance: z.number().min(0).max(1),
	kind: z.enum(topicMemoryKinds),
	factDate: z.iso.date().nullable(),
	person: topicMemoryPerson.nullable(),
	sourceFindingIndexes: z.array(z.number().int().min(0)).min(1).max(8),
})

export const topicMemoryProposal = z.object({
	facts: z
		.array(
			factFields.extend({
				operation: z.enum(["add", "merge", "skip"]),
				id: z.string().nullable(),
				text: z.string().nullable(),
				sourceFindingIndexes: z.array(z.number().int().min(0)).max(8),
			}),
		)
		.min(1)
		.max(8),
})

type TopicMemoryProposal = z.infer<typeof topicMemoryProposal>["facts"][number]
export type TopicMemoryWrite = Omit<z.infer<typeof factFields>, "sourceFindingIndexes"> &
	({ operation: "add" } | { operation: "merge"; id: string })

// account activity can be evidence of interest, but belongs outside the takeaway sentence
const READER_ACTIVITY_PATTERN =
	/\b(?:the (?:reader|user|owner|topic owner) (?:has )?(?:bookmarked|rated|thumbed|marked as read|saved this finding)|(?:was|were) bookmarked (?:by the (?:reader|user|owner)|under the title))\b/i

// the clustering input always has vectors in the current Resource embedding space
type Embedded = { embedding: number[] }

/** Groups linked findings by similarity, using a stable input order. */
export function toTopicMemoryClusters<Finding extends Embedded>(findings: Finding[]): Finding[][] {
	return toLinkedTopicMemoryGroups(
		findings,
		(first, second) => toTopicMemorySimilarity(first.embedding, second.embedding) >= TOPIC_MEMORY_CLUSTER_SIMILARITY,
	)
}

/** Joins linked rows without changing the first row of the earliest matching group. */
export function toLinkedTopicMemoryGroups<Row>(rows: Row[], areLinked: (first: Row, second: Row) => boolean): Row[][] {
	// a single row can connect two groups that were separate when their first rows arrived
	const groups: Row[][] = []
	for (const row of rows) {
		const matching = groups.filter((group) => group.some((member) => areLinked(row, member)))
		const first = matching[0]
		if (!first) {
			groups.push([row])
			continue
		}
		// absorb any other matching groups into the first survivor
		first.push(row)
		for (const group of matching.slice(1)) {
			first.push(...group)
			groups.splice(groups.indexOf(group), 1)
		}
	}
	return groups
}

/** Classifies a nearest match before a new takeaway can be written. */
export function toTopicMemorySimilarityAction(
	similarity: number,
	texts?: readonly [string, string],
): "merge" | "flag" | "add" {
	if (similarity >= TOPIC_MEMORY_MERGE_SIMILARITY && (!texts || shareTopicMemoryDates(texts))) {
		return "merge"
	}
	return similarity >= TOPIC_MEMORY_REVIEW_SIMILARITY ? "flag" : "add"
}

// a changed event date can leave the vector almost identical while changing the claim
function shareTopicMemoryDates([first, second]: readonly [string, string]): boolean {
	const isoDates = /\b\d{4}-\d{2}-\d{2}\b/g
	const left = new Set(first.match(isoDates) ?? [])
	const right = new Set(second.match(isoDates) ?? [])
	return !left.size || !right.size || (left.size === right.size && [...left].every((date) => right.has(date)))
}

/** Normalizes both parts of a person's identity. A namesake's context stays distinct. */
export function toTopicMemoryPersonMatchKey(person: TopicMemoryPerson | null): string | null {
	if (!person) {
		return null
	}
	// preserve symbols that distinguish roles such as C++ and C# instructor
	const name = person.name
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
	const detail = person.identifyingDetail
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}+#]+/gu, " ")
		.trim()
	return JSON.stringify([name, detail])
}

/** Keeps claim text and allows nominations only against the shown current facts. */
export function toTopicMemoryWrite(
	proposal: TopicMemoryProposal,
	neighborIds: ReadonlySet<string>,
): TopicMemoryWrite | null {
	if (proposal.operation === "skip") {
		return null
	}
	// a model can leak trace metadata into a claim. discard those candidates
	const fact = factFields.safeParse(proposal)
	if (
		!fact.success ||
		CONTROL_CHARACTER_PATTERN.test(fact.data.text) ||
		READER_ACTIVITY_PATTERN.test(fact.data.text) ||
		/^no[\s\p{Dash_Punctuation}]*op[.!]?$/iu.test(fact.data.text) ||
		/\b(?:no (?:event |announcement )?date in evidence|scans? \d{4}-\d{2}-\d{2})\b/i.test(fact.data.text)
	) {
		return null
	}
	const { sourceFindingIndexes: _sourceFindingIndexes, ...write } = fact.data
	if (proposal.operation === "add") {
		return { ...write, operation: "add" }
	}
	return proposal.id && neighborIds.has(proposal.id) ? { ...write, operation: "merge", id: proposal.id } : null
}

/** Returns cosine similarity, with unmatched vectors sorted below any candidate. */
export function toTopicMemorySimilarity(first: number[], second: number[]): number {
	if (first.length !== second.length || first.length === 0) {
		return -1
	}
	// use the vector lengths as well as their dot product so the policy also works for fixtures and imported vectors
	let dot = 0
	let firstLength = 0
	let secondLength = 0
	// accumulate both lengths so imported vectors need not be unit length
	for (const [index, value] of first.entries()) {
		const other = second[index] ?? 0
		dot += value * other
		firstLength += value * value
		secondLength += other * other
	}

	const denominator = Math.sqrt(firstLength * secondLength)
	return denominator > 0 ? dot / denominator : -1
}
