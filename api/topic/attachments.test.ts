// attachment tests for the context edit: which attachments have a context to replace, and the cap the route validates.
// the write itself and its gate call are covered by the authorization tests, since no test here touches a database
import { expect, test } from "bun:test"
import { attachmentContextPayload, MAX_ATTACHMENT_CONTEXT_CHARS } from "@shared/contracts"

// the edited context is capped like a generated one, so an edit cannot inflate a scan's tokens
test("attachmentContextPayload trims the context and caps its length", () => {
	// a normal edit is trimmed
	expect(attachmentContextPayload.parse({ context: "  agents and evals  " })).toEqual({
		context: "agents and evals",
	})

	// an empty context is a valid edit, since clearing a poisoned context is allowed
	expect(attachmentContextPayload.parse({ context: "" })).toEqual({ context: "" })

	// anything past the cap is rejected at the boundary rather than stored and paid for later
	const tooLongContext = "x".repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 1)
	expect(attachmentContextPayload.safeParse({ context: tooLongContext }).success).toBe(false)
})
