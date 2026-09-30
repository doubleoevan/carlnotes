// store tests: the object content key, and a delete that logs its failure instead of throwing an error
import { expect, spyOn, test } from "bun:test"
import { deleteAttachment, toResourceContentKey } from "./store"

// the resource content key is stable and namespaced by resource id, mirroring the attachment key layout
test("resourceContentKey namespaces content under the resource id", () => {
	expect(toResourceContentKey("abc123")).toBe("resources/abc123/content.md")
	expect(toResourceContentKey("abc123")).toBe(toResourceContentKey("abc123"))
})

// every delete is a best-effort cleanup, so a failed delete never fails the work it follows
test("deleteAttachment logs a failed delete instead of throwing an error", async () => {
	// leave the bucket unconfigured, so the delete fails before it reaches storage
	const originalEndpoint = Bun.env.S3_ENDPOINT
	Bun.env.S3_ENDPOINT = ""
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	try {
		await expect(deleteAttachment("topics/topic-1/attachments/attachment-1/notes.pdf")).resolves.toBeUndefined()
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
	} finally {
		consoleErrorSpy.mockRestore()
		// put the endpoint back, or unset it again if it was unset before
		if (originalEndpoint === undefined) {
			delete Bun.env.S3_ENDPOINT
		} else {
			Bun.env.S3_ENDPOINT = originalEndpoint
		}
	}
})
