// the chat attachment rules: the kind a file reads as, the size check before the read, and the rejection lines

import { expect, test } from "bun:test"
import { CHAT_IMAGE_DATA_CHARS, CHAT_PDF_DATA_CHARS, CHAT_VIDEO_DATA_CHARS } from "@carlnotes/contracts/chat"
import {
	type ChatAttachmentFileReader,
	KEEP_LIMIT_LINE,
	MESSAGE_FULL_LINE,
	QUESTION_FULL_LINE,
	toChatAttachment,
	toChatAttachmentFileKind,
	toDataUrlChars,
	UNSUPPORTED_ATTACHMENT_LINE,
} from "./chatAttachmentRules"

// a picked file whose reads count how often they run
function toFileReader(name: string, mimeType: string, byteSize = 3): ChatAttachmentFileReader & { readCount: number } {
	const source = {
		name,
		mimeType,
		byteSize,
		readCount: 0,
		readDataUrl: async () => {
			source.readCount += 1
			return `data:${mimeType || "application/octet-stream"};base64,${"A".repeat(Math.ceil(byteSize / 3) * 4)}`
		},
		readText: async () => {
			source.readCount += 1
			return "some notes"
		},
	}
	return source
}

// each kind reads from its type first and its suffix when the type is missing or misreported
test("a file reads as the kind its type or suffix names", () => {
	expect(toChatAttachmentFileKind({ name: "shot.png", mimeType: "image/png" })).toBe("image")
	expect(toChatAttachmentFileKind({ name: "paper.pdf", mimeType: "" })).toBe("pdf")
	expect(toChatAttachmentFileKind({ name: "clip.mov", mimeType: "video/quicktime" })).toBe("video")
	expect(toChatAttachmentFileKind({ name: "notes.docx", mimeType: "application/octet-stream" })).toBe("document")
	expect(toChatAttachmentFileKind({ name: "sales.csv", mimeType: "application/vnd.ms-excel" })).toBe("text")
	expect(toChatAttachmentFileKind({ name: "archive.zip", mimeType: "application/zip" })).toBeNull()
})

// the estimate matches a real base64 data url's length, prefix included
test("the data url estimate matches the encoded length", () => {
	expect(toDataUrlChars({ byteSize: 3, mimeType: "image/png" })).toBe("data:image/png;base64,".length + 4)
	expect(toDataUrlChars({ byteSize: 4, mimeType: "" })).toBe("data:application/octet-stream;base64,".length + 8)
})

// a file past its kind's limit is rejected by name and never read
test("an oversized file is rejected before it is read", async () => {
	const lines: string[] = []
	for (const [mimeType, maxChars] of [
		["image/jpeg", CHAT_IMAGE_DATA_CHARS],
		["application/pdf", CHAT_PDF_DATA_CHARS],
		["video/mp4", CHAT_VIDEO_DATA_CHARS],
	] as const) {
		const source = toFileReader("file", mimeType, Math.ceil((maxChars * 3) / 4))
		expect(await toChatAttachment(source, (line) => lines.push(line))).toBeNull()
		expect(source.readCount).toBe(0)
	}
	expect(lines).toEqual([
		"That image is too large. About 4.3 MB is the limit.",
		"That PDF is too large. About 10.0 MB is the limit.",
		"That video is too large. About 17.9 MB is the limit.",
	])
})

// a file at its limit's edge reads and posts its data url
test("a file inside its limit posts as a data url", async () => {
	const source = toFileReader("", "image/png")
	const attachment = await toChatAttachment(source, () => {})
	expect(attachment).toEqual({ kind: "image", name: "image", dataUrl: "data:image/png;base64,AAAA", keep: false })
})

// a text file posts its words and an unsupported file shows the line naming what chat takes
test("text posts as text and an unsupported file shows the supported kinds", async () => {
	expect(await toChatAttachment(toFileReader("notes.md", ""), () => {})).toEqual({
		kind: "text",
		name: "notes.md",
		text: "some notes",
		keep: false,
	})
	const lines: string[] = []
	expect(await toChatAttachment(toFileReader("archive.zip", "application/zip"), (line) => lines.push(line))).toBeNull()
	expect(lines).toEqual([UNSUPPORTED_ATTACHMENT_LINE])
})

// the limit lines read the same on both apps as they did on the web
test("the limit lines keep the web's words", () => {
	expect(QUESTION_FULL_LINE).toBe("4 attachments max per question.")
	expect(MESSAGE_FULL_LINE).toBe("4 attachments max per message.")
	expect(KEEP_LIMIT_LINE).toBe(
		"Carl's already keeping 20 files for this topic. He'll read this one, but it won't get stored.",
	)
	expect(UNSUPPORTED_ATTACHMENT_LINE).toBe(
		"Carl takes images, PDFs, Word and Excel files, text files, and videos for now.",
	)
})
