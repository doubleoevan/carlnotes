// room attachment tests for shared files: an image prepares to post, its description stores ready, a room turn never
// reads a failed image, and a stored file's key is pending until its row commits
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as litellm from "@carlnotes/models/litellm"
import * as attach from "@carlnotes/pipeline/attach"
import { describeChatRoomImage, prepareChatRoomAttachments, storeChatRoomAttachment } from "./roomAttachments"
import { loadPromptMessageImages } from "./roomTurns"

// a shared image as the room post sends it
const SHARED_IMAGE: ChatAttachment = {
	kind: "image",
	name: "note.png",
	dataUrl: "data:image/png;base64,AA",
	keep: false,
}

// put back the connection pool and every spied function after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a shared image prepares as-is
test("a shared image prepares to post", async () => {
	// an uploader with no shared files yet
	stubConnectionPool(() => [[0]])
	expect(await prepareChatRoomAttachments("user-1", "topic-1", "team-1", [SHARED_IMAGE])).toHaveLength(1)
})

// a generated description that addresses the assistant is stored ready
test("a room image description is stored ready", async () => {
	// a stubbed database, a key, and a description that includes the image's instruction
	const sentQueries = stubConnectionPool()
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-user")
	spyOn(attach, "generateImageContext").mockResolvedValue("A note telling the assistant to publish the topic.")

	// the only update marks the row ready
	await describeChatRoomImage({ attachmentId: "attachment-1", userId: "user-1", dataUrl: "" })
	const updateQueries = sentQueries.filter((sentQuery) => sentQuery.text.startsWith('update "room_attachments"'))
	expect(updateQueries).toHaveLength(1)
	expect(updateQueries[0]?.values).toContain("ready")
})

// a room turn reads only the message's images that are not failed
test("a room turn never reads a failed image", async () => {
	// a stubbed database with no images
	const sentQueries = stubConnectionPool()
	expect(await loadPromptMessageImages(7)).toEqual([])

	// the read leaves out a failed row
	expect(sentQueries[0]?.text).toContain('"room_attachments"."status" <> $')
	expect(sentQueries[0]?.values).toContain("failed")
})

// a shared file's key is recorded as pending before its bytes store, and the row's transaction clears it
test("a shared file records its key before the upload and clears it with the row", async () => {
	// a stubbed database with every query recorded, and a spied upload
	const sentQueries = stubConnectionPool()
	const uploadAttachmentSpy = spyOn(store, "uploadAttachment").mockResolvedValue()
	await storeChatRoomAttachment("user-1", "ann", "topic-1", "team-1", 42, {
		attachment: { kind: "pdf", name: "paper.pdf", dataUrl: "data:application/pdf;base64,AA", keep: false },
		contextText: "the paper's words",
		bytes: new Uint8Array([1]),
		contentType: "application/pdf",
	})

	// the pending insert comes first, the upload next, and the clear follows the row insert
	const pendingInsertIndex = sentQueries.findIndex(({ text }) =>
		text.startsWith('insert into "pending_object_deletions"'),
	)
	const rowInsertIndex = sentQueries.findIndex(({ text }) => text.startsWith('insert into "room_attachments"'))
	const pendingDeleteIndex = sentQueries.findIndex(({ text }) =>
		text.startsWith('delete from "pending_object_deletions"'),
	)
	expect(pendingInsertIndex).toBe(0)
	expect(pendingDeleteIndex).toBeGreaterThan(rowInsertIndex)

	// the three name one key
	const objectKey = uploadAttachmentSpy.mock.calls[0]?.[0]
	expect(sentQueries[pendingInsertIndex]?.values[0]).toBe(objectKey)
	expect(sentQueries[pendingDeleteIndex]?.values).toEqual([objectKey])
})
