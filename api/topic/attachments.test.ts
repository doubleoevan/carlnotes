// attachment tests for the context edit
import { expect, test } from "bun:test"
import { attachmentContextPayload, MAX_ATTACHMENT_CONTEXT_CHARS } from "@shared/contracts"
import { toStoredFileHeaders } from "./attachments"

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

// the filename survives in both header forms, and the browser never sniffs a type of its own
test("toStoredFileHeaders keeps the filename and blocks type sniffing", () => {
	const headers = toStoredFileHeaders("café shot.png", "image/png")
	expect(headers["Content-Disposition"]).toContain('filename="caf_ shot.png"')
	expect(headers["Content-Disposition"]).toContain("filename*=UTF-8''caf%C3%A9%20shot.png")
	expect(headers["X-Content-Type-Options"]).toBe("nosniff")
})
