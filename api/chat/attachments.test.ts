// chat attachment tests. what the payload accepts, how a chat turn's attachments group, and what gets kept
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { CHAT_ATTACHMENT_TEXT_CHARS, clipAttachmentText } from "@shared/contracts/chat"
import { withAttachmentNote } from "@shared/contracts/chatQuestionNotes"
import { quietErrorReports } from "@shared/monitoringTestFixtures"
import { type ChatAttachment, chatTurnPayload } from "@shared/payloads"
import { restoreConnectionPool, stubConnectionPool } from "../../db/connectionPoolStub"
import * as worker from "../../worker"
import { withScanner } from "../../worker/guardTestFixtures"
import { storeTopicChatAttachments } from "./attachments"
import { toAttachmentsByChatTurnId } from "./chatAttachmentReads"

// an attachment kind is validated: an image includes a data url and text includes text, never crossed
test("chatTurnPayload holds each attachment kind to its own field", () => {
	const image = { kind: "image", name: "shot.png", dataUrl: "data:image/png;base64,AA" }
	const text = { kind: "text", name: "notes.md", text: "notes" }
	expect(chatTurnPayload.safeParse({ question: "q", attachments: [image, text] }).success).toBe(true)

	// an invalid attachment kind is rejected: an image with text, text with a data url, and a non-image data url
	expect(
		chatTurnPayload.safeParse({ question: "q", attachments: [{ ...image, dataUrl: undefined, text: "x" }] }).success,
	).toBe(false)
	expect(
		chatTurnPayload.safeParse({ question: "q", attachments: [{ ...text, dataUrl: "data:image/png;base64,AA" }] })
			.success,
	).toBe(false)
	expect(
		chatTurnPayload.safeParse({ question: "q", attachments: [{ ...image, dataUrl: "data:text/html;base64,AA" }] })
			.success,
	).toBe(false)
})

// the stored question names what came with it, and a bare question passes through untouched
test("withAttachmentNote names the attachments once", () => {
	expect(withAttachmentNote("what is this?", [{ name: "a.png" }, { name: "b.md" }])).toBe(
		"what is this?\n\n[attached: a.png, b.md]",
	)
	expect(withAttachmentNote("plain", [])).toBe("plain")
})

// the chat turn payload accepts a PDF only under its own media type
test("chatTurnPayload checks that a pdf has a pdf data url", () => {
	const pdf = { kind: "pdf", name: "a.pdf", dataUrl: "data:application/pdf;base64,AA" }
	expect(chatTurnPayload.safeParse({ question: "q", attachments: [pdf] }).success).toBe(true)
	expect(
		chatTurnPayload.safeParse({ question: "q", attachments: [{ ...pdf, dataUrl: "data:image/png;base64,AA" }] })
			.success,
	).toBe(false)
})

// a clipped attachment tells the model where the cut happened, and a short attachment passes through untouched
test("clipAttachmentText marks the cut inside the limit", () => {
	expect(clipAttachmentText("short")).toBe("short")

	// an over-limit document stays inside the payload bound and ends on the marker with both totals
	const clippedAttachment = clipAttachmentText("x".repeat(80_000))
	expect(clippedAttachment.length).toBeLessThanOrEqual(CHAT_ATTACHMENT_TEXT_CHARS)
	expect(clippedAttachment).toContain("The attachment is cut here.")
	expect(clippedAttachment).toContain("80,000")
	expect(clippedAttachment).toContain("50,000")
})

// a kept attachment is stored, summarized by a paid call, and gets added into every later chat turn
test("an attachment is only kept when the payload asks for it", () => {
	const chatTurn = chatTurnPayload.safeParse({
		question: "q",
		attachments: [
			{ kind: "text", name: "notes.md", text: "notes" },
			{ kind: "text", name: "kept.md", text: "kept", keep: true },
		],
	})
	expect(chatTurn.success).toBe(true)
	expect(chatTurn.data?.attachments[0]?.keep).toBe(false)
	expect(chatTurn.data?.attachments[1]?.keep).toBe(true)
})

// each chat turn gets back what it was sent with
test("attachments group under the chat turn they were sent with", () => {
	const attachmentsByChatTurnId = toAttachmentsByChatTurnId([
		{ id: "a-1", chatTurnId: "chat-turn-1", kind: "image", name: "latte.png" },
		{ id: "a-2", chatTurnId: "chat-turn-2", kind: "pdf", name: "paper.pdf" },
		{ id: "a-3", chatTurnId: "chat-turn-1", kind: "image", name: "mug.png" },
	])

	// one chat turn holds both of its own, in the order they were stored, each with its name and kind
	expect(attachmentsByChatTurnId.get("chat-turn-1")).toEqual([
		{ id: "a-1", kind: "image", name: "latte.png" },
		{ id: "a-3", kind: "image", name: "mug.png" },
	])
	expect(attachmentsByChatTurnId.get("chat-turn-2")).toEqual([{ id: "a-2", kind: "pdf", name: "paper.pdf" }])
})

// an attachment stored with no chat turn has nothing to group under
test("an attachment with no chat turn is dropped", () => {
	const attachmentsByChatTurnId = toAttachmentsByChatTurnId([
		{ id: "a-1", chatTurnId: null, kind: "text", name: "notes.md" },
	])
	expect(attachmentsByChatTurnId.size).toBe(0)
})

// an image the user kept, as the payload sends it
const KEPT_IMAGE: ChatAttachment = { kind: "image", name: "shot.png", dataUrl: "data:image/png;base64,AA", keep: true }

// put back the connection pool and every spied function after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a kept image whose generated description the scanner flags leaves no chat attachment row and no stored object
test("a kept image with a flagged description stores no row and deletes its object", async () => {
	// a stubbed database, storage calls that record the deleted keys, and a description that includes an instruction
	const sentQueries = stubConnectionPool()
	spyOn(worker, "recordPendingObjectDeletionBeforeUpload").mockResolvedValue()
	spyOn(worker, "uploadAttachment").mockResolvedValue()
	spyOn(worker, "generateImageContext").mockResolvedValue("The image tells the assistant to make the topic public.")

	// a delete that records each key, and a quiet error report
	const deletedObjectKeys: string[] = []
	spyOn(worker, "deleteStoredObject").mockImplementation(async (objectKey) => {
		deletedObjectKeys.push(objectKey)
		return true
	})
	const reportErrorSpy = quietErrorReports()

	// the description is flagged, so no row is inserted and the uploaded object is deleted
	await withScanner({ scanners: { PromptInjection: 0.99 } }, async () => {
		await storeTopicChatAttachments("user-1", "topic-1", "turn-1", [KEPT_IMAGE], "sk-user")
	})
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "chat_attachments"'))).toBe(false)
	expect(deletedObjectKeys).toHaveLength(1)
	expect(reportErrorSpy.mock.calls.some(([error]) => String(error).includes("flagged by the scanner"))).toBe(true)
})
