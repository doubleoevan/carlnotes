import { afterEach, expect, spyOn, test } from "bun:test"
import {
	TOPIC_MEMORY_FACT_FORMAT_VERSION,
	TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT,
} from "@carlnotes/contracts/topicMemoryWork"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { TOPIC_MEMORY_EMBEDDING_MODEL } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import * as store from "@carlnotes/db/store"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import {
	isTopicMemoryFindingEligible,
	loadTopicMemoryFindingEvidence,
	loadTopicMemoryFindings,
	loadTopicMemoryNeighbors,
} from "./topicMemoryEvidence"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

afterEach(restoreConnectionPool)

test("Journal evidence keeps the public review's relevance and positive rating", async () => {
	// the scope match can follow a long factual description
	const description = `${"External profile and work history. ".repeat(12)}This person matches the attached roster.`
	const queries = stubConnectionPool(() => [
		["finding-1", "A named person's profile", null, description, 0.85, "up", null, null, null, null],
	])
	expect(await loadTopicMemoryFindings("brew-1", "topic-1")).toMatchObject([
		{ id: "finding-1", description, relevanceScore: 0.85, rating: "up" },
	])
	expect(queries[0]?.text).toMatch(/left\("findings"\."relevance_explanation", \$\d+\)/)
	expect(queries[0]?.values).toContain(800)
	expect(queries[0]?.values).toContain("public")
})

test("claims that cite one stored article share one read of it within an update", async () => {
	// two Findings whose article text is no longer inline, both stored under one content key
	stubConnectionPool(() => [
		["finding-1", "2026-11-02T12:00:00Z", "A cafe opens", "The cafe opened.", "Relevant.", null, "article-key", null],
		["finding-2", "2026-11-02T12:00:00Z", "A cafe opens", "The cafe opened.", "Relevant.", null, "article-key", null],
	])
	const read = spyOn(store, "getResourceContent").mockResolvedValue("Acorn Cafe opened on Main Street in May.")
	try {
		// two claims of one update read their evidence with the update's own reads
		const articleReads = new Map<string, Promise<string>>()
		const findingIds = ["finding-1", "finding-2"]
		const first = await loadTopicMemoryFindingEvidence("topic-1", findingIds, db, "Acorn Cafe opened.", articleReads)
		await loadTopicMemoryFindingEvidence("topic-1", findingIds, db, "Acorn Cafe is on Main Street.", articleReads)
		// the first claim got the article's text, and the article was read once
		expect(first.get("finding-1")?.articleContext).toContain("Acorn Cafe opened on Main Street")
		expect(read).toHaveBeenCalledTimes(1)
	} finally {
		read.mockRestore()
	}
})

test("weak unrated Findings with explicit namesake warnings stay out of extraction", () => {
	// weak review scores alone leave a Finding eligible
	const weakFinding = { relevanceScore: 0.35, rating: null }
	const description = "This reads like a different person with the same name rather than a career change."
	expect(isTopicMemoryFindingEligible({ ...weakFinding, description })).toBe(false)
	expect(
		isTopicMemoryFindingEligible({
			...weakFinding,
			description:
				"There is no corroborating detail to confirm this is the same person rather than a coincidental name match.",
		}),
	).toBe(false)
	expect(isTopicMemoryFindingEligible({ ...weakFinding, description: "The article describes a film screening." })).toBe(
		true,
	)
	expect(isTopicMemoryFindingEligible({ ...weakFinding, description, rating: "up" })).toBe(true)
})

test("a Finding group reads the five nearest Topic-scoped neighbors, including evicted history", async () => {
	// seven stored facts of seven values, nearest first, as the read's own order returns them
	const queries = stubConnectionPool(() =>
		Array.from({ length: 7 }, (_, index) => {
			const claim = [`memory-${index}`, "fact", `Fact ${index}.`, null, null, true, [], "active"]
			const seen = ["2026-11-02T12:00:00Z", "2026-11-02T12:00:00Z"]
			return [...claim, ...seen, '["cafe"]', "other", `value ${index}`, TOPIC_MEMORY_EMBEDDING_MODEL, null]
		}),
	)
	const neighbors = await loadTopicMemoryNeighbors("topic-1", [1, 0])
	expect(neighbors.map(({ id }) => id)).toEqual(["memory-0", "memory-1", "memory-2", "memory-3", "memory-4"])
	expect(queries[0]?.values).toEqual(
		expect.arrayContaining(["topic-1", "active", "outdated", TOPIC_MEMORY_EMBEDDING_MODEL, "[1,0]"]),
	)
	expect(queries[0]?.values.at(-1)).toBe(TOPIC_MEMORY_GROUP_CANDIDATE_LIMIT)
	expect(queries[0]?.text).toContain("<=>")
})

test.each([false, true])("a write completes the Scan atomically with rejected=%s", async (isRejected) => {
	// provide one eligible Finding and a completed brew ready to update topic memories
	const queries = stubConnectionPool(({ text }) => {
		const knownRows: [string, unknown[]][] = [
			// the exact match's correction subquery also reads the Topic, so its read is matched first
			['"first_brew"', []],
			['from "topics"', [toTableRow(topics, { id: "topic-1" })]],
			['from "findings"', [["finding-1", "Public", "", "", null, null]]],
			[
				'select "id", "topic_id", "owner_id"',
				[["brew-2", "topic-1", "owner-1", "2026-11-02T12:00:00Z", null, null, TOPIC_MEMORY_FACT_FORMAT_VERSION]],
			],
			["regexp_replace", isRejected ? [{ index: 0 }] : []],
			['insert into "topic_memories"', [["added"]]],
		]
		return knownRows.find(([fragment]) => text.includes(fragment))?.[1] ?? []
	})
	const write: EmbeddedTopicMemoryWrite = {
		operation: "add",
		kind: "fact",
		person: null,
		factDate: null,
		text: "The water temperature changed.",
		subject: "Water",
		claimType: "other",
		value: "temperature changed",
		importance: 0.8,
		embedding: [1, 0],
		findingIds: ["finding-1"],
	}
	await saveTopicMemoryUpdates({
		topicId: "topic-1",
		scanId: "brew-2",
		writes: [write],
		signal: new AbortController().signal,
	})
	const insert = queries.find(({ text }) => text.startsWith('insert into "topic_memories"'))
	expect(Boolean(insert)).toBe(!isRejected)
	expect(queries.some(({ text }) => text.includes("<=>"))).toBe(false)
	// a successful attempt always records its Scan even when nothing is added
	expect(queries.at(-1)?.text).toContain('update "scans" set')
	expect(queries.at(-1)?.text).toContain('"topic_memories_format_version"')
	expect(queries.at(-1)?.text).toContain('"topic_memories_updated_at"')
})

test("twenty writes of one Scan send one read of rejected wording and one insert of subjects", async () => {
	// twenty new facts about twenty subjects, each citing the Scan's one eligible Finding
	const queries = stubConnectionPool(({ text }) => {
		const knownRows: [string, unknown[][]][] = [
			['"first_brew"', []],
			['from "topics"', [toTableRow(topics, { id: "topic-1" })]],
			['from "findings"', [["finding-1", "Public", "", "", null, null]]],
			[
				'select "id", "topic_id", "owner_id"',
				[["brew-2", "topic-1", "owner-1", "2026-11-02T12:00:00Z", null, null, TOPIC_MEMORY_FACT_FORMAT_VERSION]],
			],
			['insert into "topic_memories"', [["added"]]],
		]
		return knownRows.find(([fragment]) => text.includes(fragment))?.[1] ?? []
	})
	const writes = Array.from(
		{ length: 20 },
		(_, index): EmbeddedTopicMemoryWrite => ({
			operation: "add",
			kind: "fact",
			person: null,
			factDate: null,
			text: `Cafe ${index} opened.`,
			subject: `Cafe ${index}`,
			claimType: "launch",
			value: "opened",
			importance: 0.8,
			embedding: [1, 0],
			findingIds: ["finding-1"],
		}),
	)
	await saveTopicMemoryUpdates({ topicId: "topic-1", scanId: "brew-2", writes, signal: new AbortController().signal })

	// every write was added, with two statements each between the one read and the one insert around them
	const toCount = (fragment: string): number => queries.filter(({ text }) => text.includes(fragment)).length
	expect(toCount('insert into "topic_memories"')).toBe(20)
	expect(toCount("regexp_replace")).toBe(1)
	expect(toCount('insert into "topic_memory_subject_aliases"')).toBe(1)
	const subjects = queries.find(({ text }) => text.includes('insert into "topic_memory_subject_aliases"'))
	expect(subjects?.values.filter((value) => typeof value === "string" && value.startsWith("Cafe "))).toHaveLength(40)
})

test("a Scan that an update already reached is written a second time by nothing", async () => {
	// the Scan's row holds its completion mark at the current format
	const updatedAt = "2026-11-02T13:00:00Z"
	const scanRow = ["brew-2", "topic-1", "owner-1", "2026-11-02T12:00:00Z", updatedAt, updatedAt]
	// the Topic's row, and the Scan's row with its fact format version
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1" })]
		}
		return text.includes('select "id", "topic_id", "owner_id"') ? [[...scanRow, TOPIC_MEMORY_FACT_FORMAT_VERSION]] : []
	})
	const write: EmbeddedTopicMemoryWrite = {
		operation: "add",
		kind: "fact",
		person: null,
		factDate: null,
		text: "The water temperature changed.",
		subject: "Water",
		claimType: "other",
		value: "temperature changed",
		importance: 0.8,
		embedding: [1, 0],
		findingIds: ["finding-1"],
	}
	await saveTopicMemoryUpdates({
		topicId: "topic-1",
		scanId: "brew-2",
		writes: [write],
		signal: new AbortController().signal,
	})

	// the lock and the Scan are read, and nothing is inserted, retired, or marked
	expect(queries.some(({ text }) => text.startsWith("insert"))).toBe(false)
	expect(queries.some(({ text }) => text.startsWith("update"))).toBe(false)
})
