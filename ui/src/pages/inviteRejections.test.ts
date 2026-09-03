// join page tests: every way a token can fail has a response for the person with the invite link
import { expect, test } from "bun:test"
import { inviteRejections } from "@shared/contracts"
import { INVITE_REJECTIONS } from "./inviteRejections"

// a rejection the api can answer with, but the page has no copy for would render an empty screen
test("every join rejection has its own message", () => {
	for (const rejection of inviteRejections) {
		expect(INVITE_REJECTIONS[rejection]).toBeTruthy()
	}

	// each rejection message is distinct, so the user can tell an expired link from a withdrawn one
	const rejectionMessages = inviteRejections.map((rejection) => INVITE_REJECTIONS[rejection])
	expect(new Set(rejectionMessages).size).toBe(inviteRejections.length)
})
