// tests for the terms dialog store: a rejected write opens it, a user puts it off, and another user is asked afresh
import { expect, test } from "bun:test"
import {
	clearTermsAcceptanceRequest,
	dismissTermsAcceptance,
	isTermsAcceptanceOpen,
	requestTermsAcceptance,
} from "./termsAcceptanceStore"

// the dialog for a stale account, and the same user once their version is current
const STALE_VIENNA = { userId: "user-vienna", isVersionOutdated: true }
const CURRENT_VIENNA = { userId: "user-vienna", isVersionOutdated: false }

test("a stale version opens the dialog until the user puts it off, and a rejected write reopens it", () => {
	clearTermsAcceptanceRequest()
	expect(isTermsAcceptanceOpen(STALE_VIENNA)).toBe(true)
	expect(isTermsAcceptanceOpen(CURRENT_VIENNA)).toBe(false)

	// putting it off closes it for this user alone
	dismissTermsAcceptance("user-vienna")
	expect(isTermsAcceptanceOpen(STALE_VIENNA)).toBe(false)
	expect(isTermsAcceptanceOpen({ userId: "user-carlos", isVersionOutdated: true })).toBe(true)

	// a rejected write reopens it whatever the version, and the acceptance closes it
	requestTermsAcceptance()
	expect(isTermsAcceptanceOpen(CURRENT_VIENNA)).toBe(true)
	clearTermsAcceptanceRequest()
	expect(isTermsAcceptanceOpen(CURRENT_VIENNA)).toBe(false)
})

// a rejected write waits on the dialog, and resolves with accepted or dismissed
test("a request resolves with the dialog's outcome", async () => {
	clearTermsAcceptanceRequest()
	const acceptedOutcome = requestTermsAcceptance()
	clearTermsAcceptanceRequest()
	expect(await acceptedOutcome).toBe("accepted")

	// the same for a dismissal
	const dismissedOutcome = requestTermsAcceptance()
	dismissTermsAcceptance("user-vienna")
	expect(await dismissedOutcome).toBe("dismissed")
})
