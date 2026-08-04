// the bag deals every line once before any repeat
import { expect, test } from "bun:test"
import { randomThinkingLine, THINKING_LINES } from "./thinkingLines"

test("a full cycle deals every line exactly once", () => {
	const randomThinkingLines = Array.from({ length: THINKING_LINES.length }, () => randomThinkingLine())
	expect(new Set(randomThinkingLines).size).toBe(THINKING_LINES.length)
})

test("the cycle reshuffles and keeps dealing after it empties", () => {
	const nextThinkingLines = Array.from({ length: THINKING_LINES.length }, () => randomThinkingLine())
	expect(new Set(nextThinkingLines).size).toBe(THINKING_LINES.length)
})
