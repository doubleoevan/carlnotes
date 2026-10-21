// tests for the invite-access check that creating a user invite runs on its recipient
import { expect, test } from "bun:test"
import { isInviteRejected } from "./userInvites"

// the recipient's invite-access setting: nobody rejects everyone, connected admits only connected senders
test("isInviteRejected rejects by the recipient's invite-access setting", () => {
	expect(isInviteRejected("nobody", true)).toBe(true)
	expect(isInviteRejected("nobody", false)).toBe(true)
	expect(isInviteRejected("connected", false)).toBe(true)
	expect(isInviteRejected("connected", true)).toBe(false)
	expect(isInviteRejected("anyone", false)).toBe(false)
})
