// attachment tests for the context edit
import { expect, test } from "bun:test"
import { attachmentContextPayload, MAX_ATTACHMENT_CONTEXT_CHARS } from "@shared/contracts"

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
