import { afterEach, expect, test } from "bun:test"
import { getTableConfig } from "drizzle-orm/pg-core"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { db } from "./index"
import { loadRankedTopicMemories } from "./rankedTopicMemories"
import { EMBED_DIMENSIONS } from "./schema/scans"
import { TOPIC_MEMORY_EMBEDDING_MODEL, topicMemories, topicMemoryFeedback } from "./schema/topicMemories"
import { topics } from "./schema/topics"
import { loadTopicMemoriesPage, toTopicMemoryGroupCount, toVisibleTopicMemoryGroups } from "./topicMemories"
import { saveTopicMemoryFeedback } from "./topicMemoryFeedback"

afterEach(restoreConnectionPool)

test("the Journal indexes active reads and permits one feedback row per rater", () => {
	// inspect the schema the migration is generated from
	const memories = getTableConfig(topicMemories)
	const feedback = getTableConfig(topicMemoryFeedback)
	expect(memories.indexes[0]?.config.columns.map((column) => "name" in column && column.name)).toEqual([
		"topic_id",
		"status",
		"importance",
	])
	expect(topicMemories.embedding.getSQLType()).toBe(`vector(${EMBED_DIMENSIONS})`)
	expect(feedback.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual(["topic_memory_id", "user_id"])
	expect(memories.foreignKeys.map((key) => key.reference().foreignTable)).toContain(topicMemories)
})

test("the Journal groups from creation order while prompts keep feedback priority", async () => {
	// exercise both readers, including the second page and a chapter-specific public slice
	const queries = stubConnectionPool(() => [])
	expect(await loadTopicMemoriesPage({ topicId: "topic-1", userId: null, page: 2 })).toEqual({
		items: [],
		pageCount: 0,
	})
	await loadRankedTopicMemories({ topicId: "topic-1", embeddings: [[1, 0]], isPublicOnly: true })
	// keep the Journal's date order independent of prompt relevance and ratings
	const [journal, prompt] = queries
	expect(journal?.text).toContain('order by "topic_memories"."created_at", "topic_memories"."id"')
	expect(journal?.values).toContain("active")
	expect(prompt?.values).toContain("active")
	// the prompt read ranks by rating tier, then relevance and importance, over a public Topic's rows
	expect(prompt?.text).toContain("then 0 when")
	expect(prompt?.text).toContain("then 1 else 2 end")
	expect(prompt?.text).toContain('"importance" desc')
	expect(prompt?.text).toContain("<=>")
	expect(prompt?.text).toContain('"scans"."id" = "topic_memories"."last_seen_scan_id"')
	expect(prompt?.text).toContain('"topics"."visibility" = \'public\'')
})

test("a Journal count reads only the rows that can group and counts the rest in SQL", async () => {
	// the count's read returns a number and the rows that share a key with another row
	const queries = stubConnectionPool(() => [])
	await db.select({ groups: toVisibleTopicMemoryGroups({ topicId: "topic-1", userId: null }) }).from(topics)
	expect(queries[0]?.text).toContain("'ungroupedCount', count(*) filter (where")
	expect(queries[0]?.text).toContain('"group_embedding" is not null)')

	// ninety-eight rows that stand alone, and two statements of one fact with near vectors
	const groupRow = {
		subject: '["cafe"]',
		claimType: "price" as const,
		value: "usd 10",
		factDate: null,
		embeddingModel: TOPIC_MEMORY_EMBEDDING_MODEL,
	}
	const groupRows = [
		{ ...groupRow, id: "memory-1", embedding: [1, 0] },
		{ ...groupRow, id: "memory-2", embedding: [0.99, 0.1] },
	]
	expect(toTopicMemoryGroupCount({ ungroupedCount: 98, groupRows })).toBe(99)
	expect(toTopicMemoryGroupCount({ ungroupedCount: 98, groupRows: [] })).toBe(98)
	expect(toTopicMemoryGroupCount(null)).toBe(0)
})

test("every read of ratings counts only the raters who may rate now", async () => {
	// the Journal page and the ranked prompt read, each with its subqueries over the ratings
	const queries = stubConnectionPool(() => [])
	await loadTopicMemoriesPage({ topicId: "topic-1", userId: "user-1", page: 1 })
	await loadRankedTopicMemories({ topicId: "topic-1" })
	expect(queries).toHaveLength(2)
	// each subquery names the owner, the owning team's leader, and the owner's own membership
	const toCount = (text: string, part: string): number => text.split(part).length - 1
	for (const { text } of queries) {
		const ratingReadCount = toCount(text, 'from "topic_memory_feedback"')
		expect(ratingReadCount).toBeGreaterThan(0)
		// one rater rule a subquery
		expect(toCount(text, 'rated_topic.owner_id = "topic_memory_feedback"."user_id"')).toBe(ratingReadCount)
		expect(toCount(text, "rater_membership.is_active and rater_membership.role = 'leader'")).toBe(ratingReadCount)
		expect(toCount(text, "owner_membership.user_id = rated_topic.owner_id")).toBe(ratingReadCount)
	}
})

test("invite Journal rows and Brew diary counts share the first-Scan activation gate", async () => {
	// produce enough active topic memories to exercise both the count and the page rounding
	const queries = stubConnectionPool(() => [])
	const invite = { topicId: "topic-1", userId: "subscriber-1", visibility: "invite" } as const
	expect((await loadTopicMemoriesPage({ ...invite, page: 1 })).pageCount).toBe(0)
	await db.select({ groups: toVisibleTopicMemoryGroups(invite) }).from(topics)
	expect(queries).toHaveLength(2)
	// the count must hide the same history as the page
	for (const { text } of queries) {
		expect(text).toContain('"scans"."id" = "topic_memories"."first_scan_id"')
		expect(text).toContain('"scans"."started_at" >')
		expect(text).toContain('select min("created_at") from "subscriptions"')
		expect(text).toContain('"topics"."owner_id"')
		expect(text).toContain('"team_members"."is_active"')
	}
})

test("a member who lost their lead role cannot reject a topic memory", async () => {
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1", teamId: "team-1" })]
		}
		return text.includes('from "team_members"')
			? [
					["owner-1", "leader"],
					["former-lead", "member"],
				]
			: []
	})
	// no topic memory read or write is allowed after the role check fails
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "topic-memory-1",
			userId: "former-lead",
			feedback: { rating: "down" },
		}),
	).toBe("forbidden")
	expect(queries.some(({ text }) => text.includes('from "topic_memories"'))).toBe(false)
})

// a share is a row in team_topics that any user can write for a public Topic, and it grants no rating
test("a leader of a team that only holds a share cannot rate or reject a topic memory", async () => {
	// a public Topic on no team, shared with the team that the caller leads
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1", visibility: "public" })]
		}
		return text.includes('from "team_members"') ? [["share-lead-1", "leader"]] : []
	})
	const feedbackResult = await saveTopicMemoryFeedback({
		topicId: "topic-1",
		topicMemoryId: "topic-memory-1",
		userId: "share-lead-1",
		feedback: { rating: "down" },
	})

	// the write is rejected before any memory is read, and no share is consulted
	expect(feedbackResult).toBe("forbidden")
	expect(queries.some(({ text }) => text.includes('from "topic_memories"'))).toBe(false)
	expect(queries.some(({ text }) => text.includes('"team_topics"'))).toBe(false)
})

test.each([
	{ note: "This applies only to dark roasts.", savedNote: "This applies only to dark roasts.", status: "active" },
	{ note: "Only dark roasts.\n- A second row.", savedNote: "Only dark roasts. - A second row.", status: "active" },
	{ note: "  ", savedNote: null, status: "rejected" },
])("a downvote with note '$note' leaves a topic memory $status", async ({ note, savedNote, status }) => {
	// an authorized caller reaches the scoped feedback write
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		// a rejection reads the statements that the Journal groups with the rated one, here none but itself
		if (text.includes('"rated_topic_memory"')) {
			return [["topic-memory-1", null, null, null, null, TOPIC_MEMORY_EMBEDDING_MODEL, null]]
		}
		return text.startsWith("select") ? [["topic-memory-1", false]] : []
	})
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "topic-memory-1",
			userId: "owner-1",
			feedback: { rating: "down", note },
		}),
	).toBe("saved")
	// the note is saved on one line, and a blank one as no note
	expect(queries.find(({ text }) => text.startsWith('insert into "topic_memory_feedback"'))?.values).toContain(
		savedNote,
	)
	expect(queries.find(({ text }) => text.startsWith('update "topic_memories"'))?.values).toContain(status)
})

test("clearing a rating also removes the caller's correction", async () => {
	// grant an owner access to an active topic memory
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		// a rejection reads the statements that the Journal groups with the rated one, here none but itself
		if (text.includes('"rated_topic_memory"')) {
			return [["topic-memory-1", null, null, null, null, TOPIC_MEMORY_EMBEDDING_MODEL, null]]
		}
		return text.startsWith("select") ? [["topic-memory-1", false]] : []
	})
	expect(
		await saveTopicMemoryFeedback({
			topicId: "topic-1",
			topicMemoryId: "topic-memory-1",
			userId: "owner-1",
			feedback: { rating: null },
		}),
	).toBe("saved")

	// clear either rating without editing the topic memory or other raters' feedback
	const deletion = queries.find(({ text }) => text.startsWith('delete from "topic_memory_feedback"'))
	expect(deletion?.values).toEqual(["topic-memory-1", "owner-1"])
	expect(deletion?.text).not.toContain('"rating"')
	expect(queries.some(({ text }) => text.startsWith('update "topic_memories"'))).toBe(false)
})

// one row of the Journal page's read, in its select order
function toJournalRow(row: {
	id: string
	text: string
	rating?: "up" | "down"
	note?: string
	// the fact's value, its vector as the driver returns it, its place by when it was added, and its last Scan's time
	value?: string
	embedding: string | null
	rank: number
	lastSeenAt: string
}): unknown[] {
	const feedback = [row.rating ?? null, row.note ?? null]
	const grouping = ['["cafe"]', "price", row.value ?? "usd 10", TOPIC_MEMORY_EMBEDDING_MODEL, row.embedding]
	// the id, the wording, the kind, no date, no person, the first Scan's time, and no podcast episode
	const claim = [row.id, row.text, "fact", null, null, "2026-11-01T09:00:00Z", null]
	return [...claim, ...feedback, ...grouping, row.rank, row.lastSeenAt]
}

test("a newer statement of a fact does not hide the note that the caller saved on an older one", async () => {
	// the caller rated the first statement, and a later Scan added a second one that now leads the group
	stubConnectionPool(() => [
		toJournalRow({
			id: "memory-old",
			text: "A coffee costs $10.",
			rating: "up",
			note: "Checked the menu.",
			embedding: "[1,0]",
			rank: 1,
			lastSeenAt: "2026-11-01T09:00:00Z",
		}),
		toJournalRow({
			id: "memory-new",
			text: "A coffee costs ten dollars at the counter.",
			embedding: "[0.99,0.1]",
			rank: 2,
			lastSeenAt: "2026-11-05T09:00:00Z",
		}),
	])
	const page = await loadTopicMemoriesPage({ topicId: "topic-1", userId: "owner-1", page: 1 })

	// one item with the newer wording, the caller's own rating and note, and the id that their rating is saved under
	expect(page.pageCount).toBe(1)
	expect(page.items).toMatchObject([
		{
			id: "memory-old",
			text: "A coffee costs ten dollars at the counter.",
			rating: "up",
			note: "Checked the menu.",
			kind: "fact",
		},
	])
})

test("a Journal of seven facts shows the five added last, then two, and a page past the end shows the last page", async () => {
	// seven facts of seven values in the order they were added, none of which can group
	stubConnectionPool(() =>
		Array.from({ length: 7 }, (_, index) =>
			toJournalRow({
				id: `memory-${index + 1}`,
				text: `Coffee number ${index + 1} is on the menu.`,
				value: `coffee ${index + 1}`,
				embedding: null,
				rank: index + 1,
				lastSeenAt: "2026-11-01T09:00:00Z",
			}),
		),
	)
	const toPageIds = async (page: number): Promise<string[]> =>
		(await loadTopicMemoriesPage({ topicId: "topic-1", userId: null, page })).items.map(({ id }) => id)

	// the most recently added fact leads the first page
	expect(await toPageIds(1)).toEqual(["memory-7", "memory-6", "memory-5", "memory-4", "memory-3"])
	expect(await toPageIds(2)).toEqual(["memory-2", "memory-1"])
	expect(await toPageIds(9)).toEqual(["memory-2", "memory-1"])
	expect((await loadTopicMemoriesPage({ topicId: "topic-1", userId: null, page: 1 })).pageCount).toBe(2)
})

test("a blank thumbs-down rejects every statement of the fact that the Journal shows as one", async () => {
	// the rated statement groups with one near statement, and a third with a far vector stays apart
	const toPeer = (id: string, embedding: string): unknown[] => [
		id,
		null,
		'["cafe"]',
		"price",
		"usd 10",
		TOPIC_MEMORY_EMBEDDING_MODEL,
		embedding,
	]
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toTableRow(topics, { id: "topic-1", ownerId: "owner-1" })]
		}
		// the statements that share the rated one's subject, claim type, and value
		if (text.includes('"rated_topic_memory"')) {
			return [toPeer("memory-old", "[1,0]"), toPeer("memory-new", "[0.99,0.1]"), toPeer("memory-far", "[0,1]")]
		}
		return text.startsWith("select") ? [["memory-new"]] : []
	})
	const feedbackResult = await saveTopicMemoryFeedback({
		topicId: "topic-1",
		topicMemoryId: "memory-new",
		userId: "owner-1",
		feedback: { rating: "down" },
	})

	// both statements of the fact are rejected in one update, and the separate one is not
	expect(feedbackResult).toBe("saved")
	const update = queries.find(({ text }) => text.startsWith('update "topic_memories"'))
	expect(update?.values).toEqual(expect.arrayContaining(["rejected", "memory-old", "memory-new"]))
	expect(update?.values).not.toContain("memory-far")
})
