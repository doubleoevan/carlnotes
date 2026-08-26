// join page tests: every way a token can fail has a response for the person with the invite link
import { expect, test } from "bun:test"
import { inviteRefusals } from "@shared/contracts"
import { INVITE_REFUSALS } from "./inviteRefusals"

// a refusal the api can answer with, but the page has no copy for would render an empty screen
test("every join refusal has its own message", () => {
	for (const refusal of inviteRefusals) {
		expect(INVITE_REFUSALS[refusal]).toBeTruthy()
	}

	// each refusal message is distinct, so the user can tell an expired link from a withdrawn one
	const refusalMessages = inviteRefusals.map((refusal) => INVITE_REFUSALS[refusal])
	expect(new Set(refusalMessages).size).toBe(inviteRefusals.length)
})
