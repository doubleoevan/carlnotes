// chat turn metering tests. what a chat turn costs and which chat turns keep their text
import { expect, test } from "bun:test"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import { toChatTurnRow } from "./turns"

// a persisted chat turn stores what was said, so a signed-in user can reload the page and find their conversation
test("a persisted chat turn keeps its question and answer", () => {
	const row = toChatTurnRow("user-1", "topic-1", 1000, 0, true, "who is hiring?", "four of them are")
	expect(row.question).toBe("who is hiring?")
	expect(row.answer).toBe("four of them are")
	expect(row.userId).toBe("user-1")
})

// a chat turn that does not get persisted still writes a row for the spend to reach the monthly meter
test("a chat turn that does not persist records its cost with no text", () => {
	const row = toChatTurnRow("user-1", "topic-1", 1000, 0, false, "who is hiring?", "four of them are")
	expect(row.question).toBeNull()
	expect(row.answer).toBeNull()
	expect(Number(row.cost)).toBeGreaterThan(0)
})

// the cost is the same best-effort token total that a scan uses, so one rate change moves both
test("a chat turn's cost is the chat rate applied to its tokens", () => {
	const row = toChatTurnRow("user-1", "topic-1", 1_000_000, 0, false, "q", "a")
	expect(Number(row.cost)).toBeCloseTo(tokenCost(1_000_000, CHAT_COST_PER_MILLION_TOKENS), 6)
})

// a web-enabled chat turn's searches are billed onto the same row, so the monthly meter adds what Exa cost
test("a chat turn's web searches add their cost to the row", () => {
	const row = toChatTurnRow("user-1", "topic-1", 0, 2, false, "q", "a")
	expect(Number(row.cost)).toBeCloseTo(2 * EXA_COST_PER_SEARCH, 6)
})

// a chat turn that streamed and then failed still spent tokens, so a zero-token turn is the only free one
test("a zero-token chat turn with no searches costs nothing", () => {
	const row = toChatTurnRow("user-1", "topic-1", 0, 0, false, "q", "")
	expect(Number(row.cost)).toBe(0)
})
