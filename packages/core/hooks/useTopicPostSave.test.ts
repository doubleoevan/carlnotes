// Topic Post save wait tests: a draft's save goes out a second after the last change, and a published post's after ten
import { expect, test } from "bun:test"
import { toTopicPostSaveDebounceMs } from "./useTopicPostSave"

test("a draft saves a second after the last change, and a published post ten seconds after", () => {
	expect(toTopicPostSaveDebounceMs({ publishedAt: null })).toBe(1000)
	expect(toTopicPostSaveDebounceMs({ publishedAt: "2026-11-09T12:00:00.000Z" })).toBe(10_000)
})
