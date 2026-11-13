// the add_topic_attachment tool: the owner's url reads the page, the owner's pasted text is stored as a plain-text
// file, and a user who does not own the topic adds nothing
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as attach from "@carlnotes/pipeline/attach"
import * as analytics from "@carlnotes/server/analytics"
import * as permissions from "../topic/permissions"
import { type RegisteredToolHandler, toRegisteredTools, toResultText, USER } from "./toolTestFixtures"

// the attachment each ingest returns
const ATTACHMENT = { id: "attachment-1", filename: "Burr notes.txt" } as Awaited<
	ReturnType<typeof attach.ingestAttachment>
>

// both ingests, stubbed to add, and the analytics, stubbed to send nothing
let ingestUrlSpy: ReturnType<typeof spyOn<typeof attach, "ingestUrlAttachment">>
let ingestSpy: ReturnType<typeof spyOn<typeof attach, "ingestAttachment">>
beforeEach(() => {
	ingestUrlSpy = spyOn(attach, "ingestUrlAttachment").mockResolvedValue(ATTACHMENT)
	ingestSpy = spyOn(attach, "ingestAttachment").mockResolvedValue(ATTACHMENT)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})
})

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// the add_topic_attachment handler the user gets, with the user owning the topic or not
function toAddAttachmentHandler(isOwner: boolean): RegisteredToolHandler {
	spyOn(permissions, "loadOwnedTopic").mockResolvedValue((isOwner ? { id: "topic-1" } : null) as never)
	const handler = toRegisteredTools(USER).get("add_topic_attachment")?.handler
	if (!handler) {
		throw new Error("add_topic_attachment is not registered")
	}
	return handler
}

test("the owner's url reads the page as an attachment", async () => {
	const toolResult = await toAddAttachmentHandler(true)({ topic_id: "topic-1", url: "https://example.com/burrs" })
	expect(toolResult.isError).toBe(false)
	expect(ingestUrlSpy).toHaveBeenCalledWith("topic-1", "https://example.com/burrs")
	expect(ingestSpy).not.toHaveBeenCalled()
})

test("the owner's pasted text is stored as a plain-text file named by its title", async () => {
	const toolResult = await toAddAttachmentHandler(true)({
		topic_id: "topic-1",
		title: "Burr notes",
		text: "Flat burrs keep fines low.",
	})
	expect(toResultText(toolResult)).toBe("Added Burr notes.txt. Carl reads it in the background.")

	// the text, encoded as it was pasted
	const attachmentUpload = ingestSpy.mock.calls[0]?.[0]
	expect(attachmentUpload?.filename).toBe("Burr notes.txt")
	expect(attachmentUpload?.contentType).toBe("text/plain")
	expect(new TextDecoder().decode(attachmentUpload?.bytes)).toBe("Flat burrs keep fines low.")
})

test("a user who does not own the topic adds nothing", async () => {
	const toolResult = await toAddAttachmentHandler(false)({ topic_id: "topic-1", url: "https://example.com/burrs" })
	expect(toResultText(toolResult)).toBe("Only the topic's owner adds an attachment. Nothing was added.")
	expect(ingestUrlSpy).not.toHaveBeenCalled()
})
