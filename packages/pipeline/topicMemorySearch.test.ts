import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadTopicMemoryRatingNotes, loadTopicMemorySearchFindings } from "./topicMemorySearch"

afterEach(restoreConnectionPool)

test("the search reads ratings and notes only from the raters who may rate now", async () => {
	// the memory-picked search's two reads: the facts to check and the notes beside their claims
	const queries = stubConnectionPool(() => [])
	await loadTopicMemorySearchFindings("topic-1", "scan-1")
	await loadTopicMemoryRatingNotes("topic-1")
	expect(queries).toHaveLength(2)
	// a thumbs-down, a thumbs-up, and a note each need a rater who is the owner or the owning team's leader
	const [facts, notes] = queries.map(({ text }) => text.split("rater_membership.role = 'leader'").length - 1)
	expect(facts).toBe(3)
	expect(notes).toBe(1)
})
