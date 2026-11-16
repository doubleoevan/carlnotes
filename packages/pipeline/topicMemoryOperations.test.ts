import { expect, test } from "bun:test"
import { TOPIC_MEMORY_TEXT_LIMIT } from "@carlnotes/contracts/topicMemories"
import {
	topicMemoryProposal,
	toTopicMemoryClusters,
	toTopicMemoryPersonMatchKey,
	toTopicMemorySimilarityAction,
	toTopicMemoryWrite,
} from "./topicMemoryOperations"

const fact = { kind: "fact" as const, importance: 0.7, factDate: null, person: null, sourceFindingIndexes: [0] }

test("the same story forms one cluster, including a finding that bridges groups", () => {
	const findings = [
		{ id: "first", embedding: [1, 0, 0] },
		{ id: "connected", embedding: [0.75, 0.66, 0] },
		{ id: "other", embedding: [0, 0, 1] },
		{ id: "bridge", embedding: [0.94, 0.34, 0] },
	]
	expect(toTopicMemoryClusters(findings).map((group) => group.map(({ id }) => id))).toEqual([
		["first", "bridge", "connected"],
		["other"],
	])
})

test("a cluster can propose separate facts and nominate only a shown neighbor", () => {
	// the model returns two claims, which cite their own Findings
	const merge = { ...fact, operation: "merge" as const, id: "neighbor", text: "Maya became CTO." }
	const add = {
		...fact,
		operation: "add" as const,
		id: null,
		text: "Maya won a robotics grant.",
		sourceFindingIndexes: [1],
	}
	const proposal = topicMemoryProposal.parse({ facts: [merge, add] })
	expect(proposal.facts.map(({ sourceFindingIndexes }) => sourceFindingIndexes)).toEqual([[0], [1]])
	expect(toTopicMemoryWrite(merge, new Set(["neighbor"]))).toMatchObject({ operation: "merge", id: "neighbor" })
	expect(toTopicMemoryWrite(merge, new Set(["elsewhere"]))).toBeNull()
	expect(toTopicMemoryWrite({ ...merge, operation: "skip", text: null }, new Set())).toBeNull()
	expect(toTopicMemoryWrite({ ...merge, text: "A\u0000B" }, new Set(["neighbor"]))).toBeNull()
	expect(
		toTopicMemoryWrite({ ...merge, text: "a".repeat(TOPIC_MEMORY_TEXT_LIMIT + 1) }, new Set(["neighbor"])),
	).toBeNull()
})

test("a no-op written as text cannot add or replace a takeaway", () => {
	// reject both write operations while keeping a complete statement about no-ops
	const merge = { ...fact, operation: "merge", id: "neighbor" } as const
	const add = { ...fact, operation: "add", id: null } as const
	const neighbors = new Set(["neighbor"])
	expect(toTopicMemoryWrite({ ...add, text: "no-op" }, neighbors)).toBeNull()
	expect(toTopicMemoryWrite({ ...merge, text: " NO–OP. " }, neighbors)).toBeNull()
	expect(toTopicMemoryWrite({ ...merge, text: "The deployment is a no-op." }, neighbors)).not.toBeNull()
	expect(
		toTopicMemoryWrite(
			{ ...merge, text: "James Cerenio is COO. No event date in evidence (scan 2026-11-16)." },
			neighbors,
		),
	).toBeNull()
})

test("reader bookmark activity stays out of takeaway text", () => {
	const add = { ...fact, operation: "add", id: null } as const
	const neighbors = new Set<string>()
	expect(
		toTopicMemoryWrite(
			{ ...add, text: "The reader bookmarked the s.k. manor hill clothing store homepage." },
			neighbors,
		),
	).toBeNull()
	expect(
		toTopicMemoryWrite(
			{ ...add, text: "Joseph Chen's UC San Diego Profiles page was bookmarked under the title 'joseph'." },
			neighbors,
		),
	).toBeNull()
	expect(
		toTopicMemoryWrite({ ...add, text: "Joseph Chen is Emeritus Professor of Physics at UC San Diego." }, neighbors),
	).not.toBeNull()
})

test.each([
	[0.799, "add"],
	[0.8, "flag"],
	[0.92, "flag"],
	[0.979, "flag"],
	[0.98, "merge"],
	[1, "merge"],
] as const)("similarity %s chooses %s", (similarity, action) => {
	expect(toTopicMemorySimilarityAction(similarity)).toBe(action)
})

test.each([
	["on September 25, 2026", "on September 26, 2026"],
	["on 25 September 2026", "on 26 September 2026"],
	["on 25 September, 2026", "on 25 September, 2027"],
	["on 09/25/26", "on 09/26/26"],
	["on Sep. 25", ""],
] as const)("near-identical text sends mismatched date mentions through review", (first, second) => {
	expect(
		toTopicMemorySimilarityAction(0.999, [`The meeting happened ${first}.`, `The meeting happened ${second}.`]),
	).toBe("flag")
})

test("person names normalize while evidence-backed namesake identity details stay separate", () => {
	// exercise the same-name people found bundled together in the earlier evaluation
	const taipei = toTopicMemoryPersonMatchKey({ name: "  Ｗilson Chen ", identifyingDetail: "Taipei 101 Marketing" })
	expect(taipei).toBe(toTopicMemoryPersonMatchKey({ name: "Wilson Chen", identifyingDetail: "taipei 101 marketing" }))
	expect(taipei).not.toBe(
		toTopicMemoryPersonMatchKey({ name: "Wilson Chen", identifyingDetail: "Benedictine University" }),
	)
})

test("person match keys distinguish roles that depend on punctuation", () => {
	const name = "Jordan Kim"
	expect(toTopicMemoryPersonMatchKey({ name, identifyingDetail: "C++ instructor" })).not.toBe(
		toTopicMemoryPersonMatchKey({ name, identifyingDetail: "C# instructor" }),
	)
})
