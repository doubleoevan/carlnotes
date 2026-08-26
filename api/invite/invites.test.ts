// invite-link tests for the refusal an invite url gets when its token is no longer valid
import { expect, test } from "bun:test"
import { toInviteRefusal } from "./invites"

// the moment every test case below is judged against
const now = new Date("2026-08-18T12:00:00.000Z")

// an invite with uses left, no expiry passed, and no revocation is still acceptable
function pendingInvite(
	overrides: Partial<Parameters<typeof toInviteRefusal>[0]> = {},
): Parameters<typeof toInviteRefusal>[0] {
	return { revokedAt: null, expiresAt: null, maxUses: 25, usedCount: 0, ...overrides }
}

// a good link is not refused, which is the test case every other one is measured against
test("toInviteRefusal passes a link with uses left and no expiry", () => {
	expect(toInviteRefusal(pendingInvite(), now)).toBe(null)
	expect(toInviteRefusal(pendingInvite({ expiresAt: new Date("2026-09-01T00:00:00.000Z") }), now)).toBe(null)
})

// a revoked link is refused whatever else is true of it, so the owner's revoke always wins
test("toInviteRefusal reports a revoked link ahead of its other reasons", () => {
	const revokedAt = new Date("2026-08-17T00:00:00.000Z")
	expect(toInviteRefusal(pendingInvite({ revokedAt }), now)).toBe("revoked")
	// spent and expired as well, and it still reads as revoked
	const alsoSpent = pendingInvite({ revokedAt, usedCount: 25, expiresAt: new Date("2026-08-01T00:00:00.000Z") })
	expect(toInviteRefusal(alsoSpent, now)).toBe("revoked")
})

// an expiry that has passed closes the link, and the exact instant counts as passed
test("toInviteRefusal reports an expired link", () => {
	expect(toInviteRefusal(pendingInvite({ expiresAt: new Date("2026-08-18T11:59:59.000Z") }), now)).toBe("expired")
	expect(toInviteRefusal(pendingInvite({ expiresAt: now }), now)).toBe("expired")
})

// a link is spent once its uses reach the limit, and the use before that is still acceptable
test("toInviteRefusal reports an exhausted link", () => {
	expect(toInviteRefusal(pendingInvite({ maxUses: 25, usedCount: 24 }), now)).toBe(null)
	expect(toInviteRefusal(pendingInvite({ maxUses: 25, usedCount: 25 }), now)).toBe("exhausted")
	// an email invite is the one-use case, spent by the invitee who accepted it
	expect(toInviteRefusal(pendingInvite({ maxUses: 1, usedCount: 1 }), now)).toBe("exhausted")
})
