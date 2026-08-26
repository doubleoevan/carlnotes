// the computed invite limit: each factor read alone, then the floor and the limit doubling for accepted invites
import { expect, test } from "bun:test"
import { toInviteLimit } from "./quotas"

// an account past its first week with no reputation record sits at its plan's base
test("the plan base holds for an account past its first week with nothing measured", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(10)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(30)
	expect(toInviteLimit({ plan: "premium", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(
		50,
	)
})

// a first-week account reaches a fifth of its base, and the seventh day is the boundary
test("the age factor cuts a first-week account to a fifth", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: null, isConnectedRecipient: false })).toBe(2)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 6.9, acceptedShare: null, isConnectedRecipient: false })).toBe(6)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 7, acceptedShare: null, isConnectedRecipient: false })).toBe(30)
})

// a sender below a fifth accepted has their limit halved, and at the fifth it holds
test("the reputation factor halves a mostly declined or ignored sender", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 0.1, isConnectedRecipient: false })).toBe(5)
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 0.2, isConnectedRecipient: false })).toBe(10)
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 1, isConnectedRecipient: false })).toBe(10)
})

// both factors together still leave at least one invite a day, so a mistake is recoverable
test("the floor keeps a young unpopular account at one", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: 0, isConnectedRecipient: false })).toBe(1)
})

// a connected recipient doubles whatever the factors left
test("a connected recipient doubles the limit", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: true })).toBe(20)
	// the doubling applies after the floor, so even the floor case doubles
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: 0, isConnectedRecipient: true })).toBe(2)
})
