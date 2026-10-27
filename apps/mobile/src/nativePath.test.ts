import { expect, test } from "bun:test"
import { toNativePath } from "./nativePath"

test("canonical topic and note links retain native routes and page context", () => {
	expect(toNativePath("https://carlnotes.com/topics/topic-1/coffee?sort=oldest")).toBe("/topics/topic-1?sort=oldest")
	expect(toNativePath("https://carlnotes.com/topics/topic-1/notes/note-1")).toBe("/topics/topic-1/notes/note-1")
	expect(toNativePath("https://carlnotes.com/teams/team-1/notes/note-1")).toBe("/teams/team-1/notes/note-1")
})

test("public footer pages and unrelated sites retain their browser destinations", () => {
	expect(toNativePath("https://carlnotes.com/privacy")).toBe("https://carlnotes.com/privacy")
	expect(toNativePath("https://carlnotes.com/nightshift/")).toBe("https://carlnotes.com/nightshift/")
	expect(toNativePath("https://example.com/topics/topic-1")).toBe("https://example.com/topics/topic-1")
})
