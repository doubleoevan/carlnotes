// the shared chat attachment hook through browser files: the per-question limit, the keep limit, the room mode, and
// the size check before a read

import { afterEach, expect, test } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import { CHAT_ATTACHMENT_KEEP_LIMIT, CHAT_IMAGE_DATA_CHARS } from "@carlnotes/contracts/chat"
import { type ChatAttachments, useChatAttachments } from "@carlnotes/core/hooks/useChatAttachments"
import type { ChatAttachmentFileReader } from "@carlnotes/core/lib/chatAttachmentRules"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// each test owns fetch and its mounted React environment
const originalFetch = globalThis.fetch
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

// a browser file as the shared rules read it, counting each read of its bytes
let readCount = 0
function toBrowserFileReader(file: File): ChatAttachmentFileReader {
	return {
		name: file.name,
		mimeType: file.type,
		byteSize: file.size,
		readDataUrl: async () => {
			readCount += 1
			return `data:${file.type};base64,AQID`
		},
		readText: () => file.text(),
	}
}

// mount the hook with its lines captured
async function mountChatAttachments(isRoom = false) {
	const lines: string[] = []
	const harness = await renderTestHook<ChatAttachments<File>>(() =>
		useChatAttachments({ toFileReader: toBrowserFileReader, notify: (line) => lines.push(line), isRoom }),
	)
	cleanups.push(harness.close)
	return { harness, lines }
}

// a small image file
function toImageFile(name: string): File {
	return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" })
}

test("a fifth file is turned away with the question's limit", async () => {
	const { harness, lines } = await mountChatAttachments()
	let taken: File[] = []
	await act(async () => {
		taken = await harness.read().addAttachmentFiles(["a", "b", "c", "d", "e"].map((name) => toImageFile(`${name}.png`)))
	})
	expect(taken.map((file) => file.name)).toEqual(["a.png", "b.png", "c.png", "d.png"])
	expect(lines).toEqual(["4 attachments max per question."])
	expect(harness.read().attachments.every((attachment) => attachment.keep)).toBe(true)
})

test("a file past the keep limit is read for the question but not kept", async () => {
	const { harness, lines } = await mountChatAttachments()
	await act(async () => {
		harness.read().setKeptAttachments(
			Array.from({ length: CHAT_ATTACHMENT_KEEP_LIMIT }, (_, index) => ({
				id: `kept-${index}`,
				kind: "image" as const,
				at: "2026-10-01T00:00:00.000Z",
				name: `kept-${index}.png`,
			})),
		)
	})
	await act(async () => {
		await harness.read().addAttachmentFiles([toImageFile("late.png")])
	})
	expect(harness.read().attachments).toEqual([
		{ kind: "image", name: "late.png", dataUrl: "data:image/png;base64,AQID", keep: false },
	])
	expect(lines).toEqual([
		"Carl's already keeping 20 files for this topic. He'll read this one, but it won't get stored.",
	])
})

test("a room message keeps nothing and names its own limit", async () => {
	const { harness, lines } = await mountChatAttachments(true)
	await act(async () => {
		await harness.read().addAttachmentFiles(["a", "b", "c", "d", "e"].map((name) => toImageFile(`${name}.png`)))
	})
	expect(harness.read().attachments.some((attachment) => attachment.keep)).toBe(false)
	expect(lines).toEqual(["4 attachments max per message."])
})

test("an oversized image is rejected before its bytes are read", async () => {
	const { harness, lines } = await mountChatAttachments()
	readCount = 0
	const oversizedImage = new File([new Uint8Array(Math.ceil((CHAT_IMAGE_DATA_CHARS * 3) / 4))], "huge.png", {
		type: "image/png",
	})
	await act(async () => {
		await harness.read().addAttachmentFiles([oversizedImage])
	})
	expect(readCount).toBe(0)
	expect(harness.read().attachments).toEqual([])
	expect(lines).toEqual(["That image is too large. About 4.3 MB is the limit."])
})

test("a rejected kept delete leaves the file listed, and an accepted one removes it", async () => {
	const { harness } = await mountChatAttachments()
	await act(async () => {
		harness.read().setKeptAttachments([{ id: "kept", kind: "pdf", name: "paper.pdf", at: "2026-10-01T00:00:00.000Z" }])
	})
	globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch
	await act(async () => harness.read().removeKeptAttachment("kept"))
	expect(harness.read().keptAttachments.map((kept) => kept.id)).toEqual(["kept"])
	globalThis.fetch = (async () => Response.json({ ok: true })) as unknown as typeof fetch
	await act(async () => harness.read().removeKeptAttachment("kept"))
	expect(harness.read().keptAttachments).toEqual([])
})
