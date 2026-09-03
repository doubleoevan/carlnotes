// user-invite tests for the recipient check that an accepted or declined invite runs
import { expect, test } from "bun:test"
import { isInviteRecipient, isInviteRejected } from "./userInvites"

// the recipient check matches an invitation by resolved account or by verified address, and nobody else
test("isInviteRecipient matches by account and by verified address", () => {
	const user = { id: "user-1", email: "reader@example.com", isEmailVerified: true }
	// a username invite names the account, a resolved or unresolved email invite names the address
	expect(isInviteRecipient({ invitedUserId: "user-1", email: null }, user)).toBe(true)
	expect(isInviteRecipient({ invitedUserId: null, email: "reader@example.com" }, user)).toBe(true)
	expect(isInviteRecipient({ invitedUserId: "user-2", email: "other@example.com" }, user)).toBe(false)
	// a link invite names nobody, so nobody is its recipient
	expect(isInviteRecipient({ invitedUserId: null, email: null }, user)).toBe(false)
})

// anyone can sign up with an address they never proved, so an unverified one matches nothing
test("isInviteRecipient rejects an unverified address and keeps the account match", () => {
	const unverifiedUser = { id: "user-1", email: "reader@example.com", isEmailVerified: false }
	expect(isInviteRecipient({ invitedUserId: null, email: "reader@example.com" }, unverifiedUser)).toBe(false)
	// the account match stands, since a username invite named the account itself and claims no address
	expect(isInviteRecipient({ invitedUserId: "user-1", email: null }, unverifiedUser)).toBe(true)
})

// an invitation resolves the address to whichever account holds it, and holding one is not proving one
test("isInviteRecipient rejects an unverified account the invited address resolved to", () => {
	const squatter = { id: "user-2", email: "reader@example.com", isEmailVerified: false }
	expect(isInviteRecipient({ invitedUserId: "user-2", email: "reader@example.com" }, squatter)).toBe(false)
	// the same invitation accepts once that account proves the address
	const verified = { ...squatter, isEmailVerified: true }
	expect(isInviteRecipient({ invitedUserId: "user-2", email: "reader@example.com" }, verified)).toBe(true)
})

// the recipient's invite-access setting: nobody rejects everyone, connected admits only connected senders
test("isInviteRejected rejects by the recipient's invite-access setting", () => {
	expect(isInviteRejected("nobody", true)).toBe(true)
	expect(isInviteRejected("nobody", false)).toBe(true)
	expect(isInviteRejected("connected", false)).toBe(true)
	expect(isInviteRejected("connected", true)).toBe(false)
	expect(isInviteRejected("anyone", false)).toBe(false)
})
