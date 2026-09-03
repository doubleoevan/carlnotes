// invite-link tests for the rejection an invite url gets when its token is no longer valid
import { expect, test } from "bun:test"
import { isAutomaticInvite, toInviteRejection } from "./invites"

// the moment every test case below is judged against
const now = new Date("2026-08-18T12:00:00.000Z")

// an invite with uses left and no expiry passed is still acceptable
function pendingInvite(
	overrides: Partial<Parameters<typeof toInviteRejection>[0]> = {},
): Parameters<typeof toInviteRejection>[0] {
	return { expiresAt: null, maxUses: 25, usedCount: 0, ...overrides }
}

// a good link is not rejected, which is the test case every other one is measured against
test("toInviteRejection passes a link with uses left and no expiry", () => {
	expect(toInviteRejection(pendingInvite(), now)).toBe(null)
	expect(toInviteRejection(pendingInvite({ expiresAt: new Date("2026-09-01T00:00:00.000Z") }), now)).toBe(null)
})

// an expiry that has passed closes the link, and the exact instant counts as passed
test("toInviteRejection reports an expired link", () => {
	expect(toInviteRejection(pendingInvite({ expiresAt: new Date("2026-08-18T11:59:59.000Z") }), now)).toBe("expired")
	expect(toInviteRejection(pendingInvite({ expiresAt: now }), now)).toBe("expired")
})

// a link is spent once its uses reach the limit, and the use before that is still acceptable
test("toInviteRejection reports an exhausted link", () => {
	expect(toInviteRejection(pendingInvite({ maxUses: 25, usedCount: 24 }), now)).toBe(null)
	expect(toInviteRejection(pendingInvite({ maxUses: 25, usedCount: 25 }), now)).toBe("exhausted")
	// an email invite is the one-use case, spent by the invitee who accepted it
	expect(toInviteRejection(pendingInvite({ maxUses: 1, usedCount: 1 }), now)).toBe("exhausted")
})

// a live invitation naming the person who is now accepting some other invitation
const USER_INVITE = { id: "named-invite", expiresAt: null, maxUses: 1, usedCount: 0 }

// anyone on the team can name someone, and the person they named is expected however they arrive
test("a live invitation naming the accepter admits them", () => {
	expect(isAutomaticInvite(USER_INVITE, "open-link-invite", now)).toBe(true)
})

// an open link naming nobody reads as no row here, so it writes the join request instead
test("no invitation naming the accepter admits nobody", () => {
	expect(isAutomaticInvite(undefined, "open-link-invite", now)).toBe(false)
})

// a dead invitation vouches for nobody, however it died
test("an expired or spent invitation admits nobody", () => {
	const expired = { ...USER_INVITE, expiresAt: new Date("2026-08-17T00:00:00.000Z") }
	expect(isAutomaticInvite(expired, "open-link-invite", now)).toBe(false)
	expect(isAutomaticInvite({ ...USER_INVITE, usedCount: 1 }, "open-link-invite", now)).toBe(false)
})

// accepting an invitation addressed to you already joins on the main path, so it must not also vouch
test("the invitation being accepted never vouches for itself", () => {
	expect(isAutomaticInvite(USER_INVITE, USER_INVITE.id, now)).toBe(false)
})
