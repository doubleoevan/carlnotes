import { expect, test } from "bun:test"
import { TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { TOPIC_MEMORY_EMBEDDING_MODEL } from "./schema/topicMemories"
import { groupTopicMemories, preferTopicMemoryRepresentative, toTopicMemorySimilarity } from "./topicMemoryGroups"

// what grouping reads of a topic memory
type GroupRow = {
	id: string
	subject: string | null
	claimType: "price"
	value: string
	factDate: string | null
	// its vector, and the model that made it
	embedding: number[] | null
	embeddingModel: string
}

// a topic memory's grouping inputs, with a price of ten dollars at the cafe unless a test says otherwise
function toRow(
	id: string,
	embedding: number[] | null,
	key: { value?: string; factDate?: string | null } = {},
): GroupRow {
	return {
		id,
		subject: '["cafe"]',
		claimType: "price" as const,
		value: key.value ?? "usd 10",
		factDate: key.factDate ?? null,
		embedding,
		embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
	}
}

// the ids of each group, in the order the groups and their members come back
function toGroupIds(rows: GroupRow[]): string[][] {
	return groupTopicMemories(rows).map((group) => group.map(({ id }) => id))
}

test("statements of one fact group if they share a key and their vectors are near", () => {
	// two near statements, one far statement of the same key, and one statement of another value
	const rows = [
		toRow("a", [1, 0]),
		toRow("b", [0.99, 0.1]),
		toRow("c", [0, 1]),
		toRow("d", [1, 0], { value: "usd 12" }),
	]
	expect(toGroupIds(rows)).toEqual([["a", "b"], ["c"], ["d"]])
})

test("a group needs every member to match every other, so one statement never bridges two that differ", () => {
	// b is near both a and c, and a is far from c
	const rows = [toRow("a", [1, 0]), toRow("b", [0.8, 0.6]), toRow("c", [0.28, 0.96])]
	expect(toTopicMemorySimilarity([1, 0], [0.8, 0.6])).toBeCloseTo(0.8)
	expect(toGroupIds(rows)).toEqual([["a", "b"], ["c"]])
})

test("conflicting dates and two exact dated values stay apart", () => {
	// a month and a different month conflict, and a year and a month within it do not
	expect(
		toGroupIds([toRow("a", [1, 0], { factDate: "2025-07" }), toRow("b", [1, 0], { factDate: "2025-08" })]),
	).toEqual([["a"], ["b"]])
	expect(toGroupIds([toRow("a", [1, 0], { factDate: "2025" }), toRow("b", [1, 0], { factDate: "2025-07" })])).toEqual([
		["a", "b"],
	])

	// two rows with a full date and a single-valued claim type are exact keys, which only the writer combines
	const dated = { factDate: "2025-07-01" }
	expect(toGroupIds([toRow("a", [1, 0], dated), toRow("b", [1, 0], dated)])).toEqual([["a"], ["b"]])
})

test("a row with no vector, another model's vector, or no key stands alone", () => {
	const otherModel = { ...toRow("b", [1, 0]), embeddingModel: "older-model" }
	const noSubject = { ...toRow("c", [1, 0]), subject: null }
	expect(toGroupIds([toRow("a", null), otherModel, noSubject, toRow("d", [1, 0])])).toEqual([
		["a"],
		["b"],
		["c"],
		["d"],
	])
})

test("groups keep the caller's order, and a key past its candidate limit stops grouping", () => {
	// the caller ranked z first, and grouping visits rows in id order
	expect(toGroupIds([toRow("z", [1, 0]), toRow("a", [0, 1]), toRow("m", [0.99, 0.1])])).toEqual([["z", "m"], ["a"]])

	// one more identical row than the limit leaves the last one by id alone
	const rows = Array.from({ length: TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT + 1 }, (_, index) =>
		toRow(`row-${String(index).padStart(3, "0")}`, [1, 0]),
	)
	const groups = groupTopicMemories(rows)
	expect(groups.map((group) => group.length)).toEqual([TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT, 1])
})

test("a group shows its newest observation, then its fullest wording", () => {
	const older = { id: "a", lastSeenAt: new Date("2026-11-01"), text: "A coffee costs ten dollars at the counter." }
	const newer = { id: "b", lastSeenAt: new Date("2026-11-05"), text: "A coffee costs $10." }
	const fuller = { id: "c", lastSeenAt: new Date("2026-11-05"), text: "A coffee costs $10 at the counter." }
	expect([older, newer, fuller].toSorted(preferTopicMemoryRepresentative).map(({ id }) => id)).toEqual(["c", "b", "a"])
})
