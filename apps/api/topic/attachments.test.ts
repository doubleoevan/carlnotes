// attachment tests for the context edit, the stored file's headers, and the uploads' rate limit
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { attachmentContextPayload } from "@carlnotes/contracts/topicPayloads"
import { MAX_ATTACHMENT_CONTEXT_CHARS } from "@carlnotes/contracts/topics"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as attach from "@carlnotes/pipeline/attach"
import * as analytics from "@carlnotes/server/analytics"
import { CALLER_RATE_LIMIT } from "../rateLimit"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { topicAttachmentsRoute, toStoredFileHeaders } from "./attachments"
import * as permissions from "./permissions"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// the edited context is limited like a generated one, so an edit cannot inflate a scan's tokens
test("attachmentContextPayload trims the context and limits its length", () => {
	// a normal edit is trimmed
	expect(attachmentContextPayload.parse({ context: "  agents and evals  " })).toEqual({
		context: "agents and evals",
	})

	// an empty context is a valid edit that clears a poisoned context
	expect(attachmentContextPayload.parse({ context: "" })).toEqual({ context: "" })

	// anything past the limit is rejected at the boundary instead of being stored and paid for later
	const tooLongContext = "x".repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 1)
	expect(attachmentContextPayload.safeParse({ context: tooLongContext }).success).toBe(false)
})

// an image is shown in place, and everything else still downloads
test("toStoredFileHeaders serves a safe image inline and downloads the rest", () => {
	// the types a browser renders without running anything
	for (const imageType of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]) {
		expect(toStoredFileHeaders("shot.png", imageType)["Content-Disposition"]).toStartWith("inline;")
	}

	// svg can hold script that would run in this origin, and a pdf or a text file is not an image at all
	expect(toStoredFileHeaders("logo.svg", "image/svg+xml")["Content-Disposition"]).toStartWith("attachment;")
	expect(toStoredFileHeaders("paper.pdf", "application/pdf")["Content-Disposition"]).toStartWith("attachment;")
	expect(toStoredFileHeaders("notes.txt", "text/plain; charset=utf-8")["Content-Disposition"]).toStartWith(
		"attachment;",
	)
})

// a stored type with parameters or odd casing still resolves to its media type
test("toStoredFileHeaders reads the media type before any parameters", () => {
	expect(toStoredFileHeaders("shot.png", "IMAGE/PNG")["Content-Disposition"]).toStartWith("inline;")
	expect(toStoredFileHeaders("shot.png", "image/png; name=shot.png")["Content-Disposition"]).toStartWith("inline;")
})

// the filename survives in both header forms
test("toStoredFileHeaders keeps the filename", () => {
	const headers = toStoredFileHeaders("café shot.png", "image/png")
	expect(headers["Content-Disposition"]).toContain('filename="caf_ shot.png"')
	expect(headers["Content-Disposition"]).toContain("filename*=UTF-8''caf%C3%A9%20shot.png")
})

// a file upload and an added url count in one rate limit window with the caller's chat turns, so a burst of uploads
// from one account is rejected before a file is stored or a page is fetched
test("an attachment upload past the tool callers' rate limit is rejected with a 429", async () => {
	// the owner's topic, with both ingests stubbed to add and the analytics stubbed to send nothing
	stubRedisClient()
	spyOn(permissions, "loadOwnedTopic").mockResolvedValue({ id: "topic-1" } as never)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const attachment = { id: "attachment-1", filename: "notes.txt" } as Awaited<
		ReturnType<typeof attach.ingestAttachment>
	>
	const ingestAttachmentSpy = spyOn(attach, "ingestAttachment").mockResolvedValue(attachment)
	const ingestUrlAttachmentSpy = spyOn(attach, "ingestUrlAttachment").mockResolvedValue(attachment)

	// a file upload and an added url, each as the owner sends it
	const app = toSignedInApp(topicAttachmentsRoute, "user-1")
	const uploadFile = async (): Promise<Response> => {
		const body = new FormData()
		body.set("file", new File(["Carl reads the notes."], "notes.txt", { type: "text/plain" }))
		return app.request("/topics/topic-1/attachments", { method: "POST", body })
	}
	const addUrl = async (): Promise<Response> =>
		app.request("/topics/topic-1/attachments/url", toJsonRequest({ url: "https://example.com/notes" }))

	// the uploads up to the limit are added, the files and the urls counted together
	for (let i = 0; i < CALLER_RATE_LIMIT; i++) {
		expect((await (i % 2 === 0 ? uploadFile() : addUrl())).status).toBe(200)
	}

	// the next file and the next url are rejected, and nothing more is stored or fetched
	const limitedUploadResponse = await uploadFile()
	expect(limitedUploadResponse.status).toBe(429)
	expect(await limitedUploadResponse.json()).toEqual({ error: "rate limited" })
	expect((await addUrl()).status).toBe(429)
	expect(ingestAttachmentSpy).toHaveBeenCalledTimes(CALLER_RATE_LIMIT / 2)
	expect(ingestUrlAttachmentSpy).toHaveBeenCalledTimes(CALLER_RATE_LIMIT / 2)
})
