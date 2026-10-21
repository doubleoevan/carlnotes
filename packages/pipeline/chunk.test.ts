// chunk tests: chunking covers the whole document and never exceeds the max-chunks bound
import { expect, test } from "bun:test"
import { chunk } from "./chunk"

// empty text yields no chunks
test("chunk returns nothing for empty text", () => {
	expect(chunk("", 8, 8000)).toEqual([])
})

// a document that fits the target size is left as one chunk
test("chunk keeps a small document in one chunk", () => {
	expect(chunk("hello world", 8, 8000)).toEqual(["hello world"])
})

// a document splits into target-sized chunks that rejoin to the original
test("chunk splits and preserves the whole document", () => {
	const chunks = chunk("abcdef", 3, 2)
	expect(chunks).toEqual(["ab", "cd", "ef"])
	expect(chunks.join("")).toBe("abcdef")
})

// a document larger than maxChunks * chunkChars makes maxChunks larger chunks, never more, and still covers everything
test("chunk never exceeds the max-chunks bound and still covers the document", () => {
	const text = "x".repeat(100)
	const chunks = chunk(text, 4, 10)
	expect(chunks.length).toBe(4)
	expect(chunks.join("")).toBe(text)
})
