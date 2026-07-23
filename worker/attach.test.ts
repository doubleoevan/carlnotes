// attachment tests for the pure extractor, the prompt builder, the ingestion guards, and the object key sanitizer
import { expect, test } from "bun:test"
import { buildContextPrompt, extractText, ingestAttachment, ingestUrlAttachment } from "./attach"
import { attachmentKey } from "./store"

// a fetcher that fails if reached. it proves URL validation rejects before any Firecrawl call
const failIfFetched = async (): Promise<string> => {
	throw new Error("fetcher should not be called")
}

// text and Markdown decodes through the extractor
test("extractText decodes text and markdown to a string", async () => {
	const bytes = new TextEncoder().encode("# Resume\nSenior engineer")
	expect(await extractText("text/markdown", bytes)).toContain("Senior engineer")
})

// an unsupported content type has no extractor and gets rejected before anything is stored
test("extractText rejects an unsupported content type", async () => {
	await expect(extractText("image/png", new Uint8Array())).rejects.toThrow(/unsupported/)
})

// an oversized upload is rejected before any storage or model call
test("ingestAttachment rejects an oversized file before touching storage or the model", async () => {
	// one byte past the 10 MB cap. the size check runs first, so nothing is stored or sent to the model
	const bytes = new Uint8Array(10 * 1024 * 1024 + 1)
	await expect(
		ingestAttachment({ topicId: "t1", filename: "big.pdf", contentType: "application/pdf", bytes }),
	).rejects.toThrow()
})

// the context prompt carries the document text
test("buildContextPrompt includes the document text", async () => {
	// the prompt written from attach-context.md carries the document and no unfilled placeholders
	const { prompt: contextPrompt } = await buildContextPrompt("a novel about the moon")
	expect(contextPrompt).toContain("a novel about the moon")
	expect(contextPrompt).not.toContain("{{")
})

// a malformed URL is rejected before Firecrawl is ever called
test("ingestUrlAttachment rejects a malformed URL before fetching", async () => {
	await expect(ingestUrlAttachment("t1", "not a url", failIfFetched)).rejects.toThrow(/invalid attachment URL/)
})

// a non-http(s) scheme parses as a URL but is rejected before fetching
test("ingestUrlAttachment rejects a non-http(s) URL before fetching", async () => {
	await expect(ingestUrlAttachment("t1", "file:///etc/passwd", failIfFetched)).rejects.toThrow(/http/)
})

// a normal filename passes through untouched, producing a well-formed key
test("attachmentKey keeps a normal filename intact", () => {
	expect(attachmentKey("t1", "a1", "resume.pdf")).toBe("topics/t1/attachments/a1/resume.pdf")
})

// a path-traversal filename is flattened to one safe key segment. no separators leak into the object key
test("attachmentKey sanitizes a traversal-y filename", () => {
	const key = attachmentKey("t1", "a1", "../../etc/passwd")
	// only the four fixed prefix slashes remain. a leaked separator would add more segments
	expect(key.split("/")).toHaveLength(5)
	expect(key).toContain("topics/t1/attachments/a1/")
})

// a dot-only filename would leave a "." or ".." segment for a downstream filesystem sync to resolve. it falls back to a fixed name instead
test("attachmentKey rejects a dot-only filename", () => {
	expect(attachmentKey("t1", "a1", "..")).toBe("topics/t1/attachments/a1/file")
})
