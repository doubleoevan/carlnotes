// Topic Post contract tests: the word count, what a publish needs, a body's plain paragraphs, and a save's title
import { expect, test } from "bun:test"
import { isTopicPostComplete, toBodyParagraphs, topicPostSavePayload, toWordCount } from "./topicPosts"

test("words are counted across any whitespace, and an empty text has none", () => {
	expect(toWordCount("one  two\nthree")).toBe(3)
	expect(toWordCount("   ")).toBe(0)
})

test("a publish needs a title and 300 words", () => {
	expect(isTopicPostComplete("A title", 300)).toBe(true)
	expect(isTopicPostComplete("A title", 299)).toBe(false)
	expect(isTopicPostComplete("  ", 300)).toBe(false)
})

test("a body's blocks read as plain paragraphs in order, with no empty one", () => {
	const html = "<html><h1>Start</h1><p>First <b>bold</b> line.</p><ul><li>One</li><li>Two</li></ul><p></p></html>"
	expect(toBodyParagraphs(html)).toEqual(["Start", "First bold line.", "One", "Two"])
})

test("a save's title is trimmed, keeps a tab, and is rejected with a control character", () => {
	const parseTitle = (title: string): ReturnType<typeof topicPostSavePayload.safeParse> =>
		topicPostSavePayload.safeParse({ title, html: "", version: 1 })
	expect(parseTitle("  Dialing in ").data?.title).toBe("Dialing in")
	expect(parseTitle("Dialing\tin").success).toBe(true)

	// a NUL, which Postgres text cannot hold, and an escape character
	expect(parseTitle("Dialing\u0000in").success).toBe(false)
	expect(parseTitle("Dialing\u001bin").success).toBe(false)
})
