// user-invite tests for the recipient check that an accepted or declined invite runs
import { expect, test } from "bun:test"
import { isInviteRecipient, isInviteRefused } from "./userInvites"

// the recipient check matches an invitation by resolved account or by invited address, and nobody else
test("isInviteRecipient matches by account and by address", () => {
	const user = { id: "user-1", email: "reader@example.com" }
	// a username invite names the account, a resolved or unresolved email invite names the address
	expect(isInviteRecipient({ invitedUserId: "user-1", email: null }, user)).toBe(true)
	expect(isInviteRecipient({ invitedUserId: null, email: "reader@example.com" }, user)).toBe(true)
	expect(isInviteRecipient({ invitedUserId: "user-2", email: "other@example.com" }, user)).toBe(false)
	// a link invite names nobody, so nobody is its recipient
	expect(isInviteRecipient({ invitedUserId: null, email: null }, user)).toBe(false)
})

// the recipient's invite-access setting: nobody refuses everyone, connected admits only connected senders
test("isInviteRefused refuses by the recipient's invite-access setting", () => {
	expect(isInviteRefused("nobody", true)).toBe(true)
	expect(isInviteRefused("nobody", false)).toBe(true)
	expect(isInviteRefused("connected", false)).toBe(true)
	expect(isInviteRefused("connected", true)).toBe(false)
	expect(isInviteRefused("anyone", false)).toBe(false)
})
