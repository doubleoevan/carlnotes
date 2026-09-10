// mcp read test: pages, cursors, the caller's finding shape, and the bound-topic rule
import { expect, test } from "bun:test"
import type { TopicFinding } from "@shared/contracts"
import { CONNECT_ACCOUNT_TEXT, fromCursor, packPage, toCursor, toMcpFinding, toToolTopicId } from "./results"

// a topic finding with an explanation of the given length
function topicFinding(index: number, explanationChars = 40): TopicFinding {
	return {
		findingId: `finding-${index}`,
		scanId: "scan-1",
		resourceId: `resource-${index}`,
		url: `https://example.test/${index}`,
		resourceKind: "read",
		title: `Finding ${index}`,
		source: "example.test",
		publishedAt: "2026-09-01T00:00:00.000Z",
		fetchedAt: "2026-09-02T00:00:00.000Z",
		relevanceScore: 0.9,
		relevanceExplanation: "x".repeat(explanationChars),
		viewCount: 0,
		rating: null,
		engagement: null,
		isConsumed: index === 1,
		isBookmarked: false,
		teamBookmarks: [],
	}
}

// a page holds whole entries up to its budget and returns the cursor for the rest
test("a page packs whole items under the character budget and continues with a cursor", () => {
	const items = [1, 2, 3, 4].map((index) => ({ index, text: "y".repeat(100) }))
	const itemChars = JSON.stringify(items[0]).length
	const packedPage = packPage(items, 0, itemChars * 2 + 1, 20)
	expect(packedPage.items.map((item) => item.index)).toEqual([1, 2])
	expect(packedPage.nextCursor).not.toBeNull()

	// follow the cursor to the rest, which has no cursor of its own
	const nextPage = packPage(items, fromCursor(packedPage.nextCursor), itemChars * 2 + 1, 20)
	expect(nextPage.items.map((item) => item.index)).toEqual([3, 4])
	expect(nextPage.nextCursor).toBeNull()
})

// an entry larger than the budget still goes out whole, on its own page
test("a page always holds at least one item and never cuts it", () => {
	const items = [{ text: "z".repeat(500) }, { text: "w".repeat(500) }]
	const packedPage = packPage(items, 0, 100, 20)
	expect(packedPage.items).toEqual(items.slice(0, 1))
	expect(packedPage.nextCursor).toBe(toCursor(1))
})

// the count limit ends a page the same way the character budget does
test("a page stops at the item limit", () => {
	const items = [1, 2, 3].map((index) => ({ index }))
	const packedPage = packPage(items, 0, 100_000, 2)
	expect(packedPage.items.length).toBe(2)
	expect(fromCursor(packedPage.nextCursor)).toBe(2)
})

// a cursor round-trips its offset. null, garbage, or a negative one reads as the start
test("a cursor round-trips and garbage reads as the start", () => {
	expect(fromCursor(toCursor(17))).toBe(17)
	expect(fromCursor(null)).toBe(0)
	expect(fromCursor("not a cursor")).toBe(0)
	expect(fromCursor(toCursor(-3))).toBe(0)
})

// a visitor's finding has no per-user field, and a user's has its consumed and bookmark times
test("a visitor's finding has no per-user fields and a user's has them", () => {
	const visitorFinding = toMcpFinding({ kind: "visitor" }, topicFinding(1))
	expect("isConsumed" in visitorFinding).toBe(false)
	expect("isBookmarked" in visitorFinding).toBe(false)
	expect(visitorFinding.relevanceExplanation).toBe("x".repeat(40))

	// read the same finding as a user
	const userFinding = toMcpFinding({ kind: "user", userId: "user-1", plan: "free" }, topicFinding(1))
	expect(userFinding.isConsumed).toBe(true)
	expect(userFinding.isBookmarked).toBe(false)
})

// a topic-bound server returns its topic, fills a missing argument, and rejects a different one
test("the bound topic rule fills, allows, and rejects", () => {
	expect(toToolTopicId("topic-a", null)).toEqual({ topicId: "topic-a" })
	expect(toToolTopicId("topic-a", "topic-a")).toEqual({ topicId: "topic-a" })
	expect("rejection" in toToolTopicId("topic-a", "topic-b")).toBe(true)

	// the unbound server needs the argument
	expect(toToolTopicId(null, "topic-b")).toEqual({ topicId: "topic-b" })
	expect("rejection" in toToolTopicId(null, null)).toBe(true)
})

// the visitor result for an account-only tool asks for an account and says what works without one
test("the connect text asks for an account and names what works without one", () => {
	expect(CONNECT_ACCOUNT_TEXT).toContain("connected CarlNotes account")
	expect(CONNECT_ACCOUNT_TEXT).toContain("without one")
})
