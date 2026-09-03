// the computed invite limit: each factor read alone, then the floor and the limit doubling for accepted invites
import { expect, test } from "bun:test"
import { PLANS } from "@shared/plans"
import { toInviteLimit } from "./quotas"

// each plan's own base, so a limit change in the plans table cannot leave these expectations behind
const FREE_BASE = PLANS.free.inviteLimit
const PLUS_BASE = PLANS.plus.inviteLimit

// an account past its first week with no reputation record sits at its plan's base
test("the plan base holds for an account past its first week with nothing measured", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(
		FREE_BASE,
	)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(
		PLUS_BASE,
	)
	expect(toInviteLimit({ plan: "premium", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(
		PLANS.premium.inviteLimit,
	)
})

// a first-week account reaches a fifth of its base, and the seventh day is the boundary
test("the age factor cuts a first-week account to a fifth", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: null, isConnectedRecipient: false })).toBe(
		Math.floor(FREE_BASE / 5),
	)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 6.9, acceptedShare: null, isConnectedRecipient: false })).toBe(
		Math.floor(PLUS_BASE / 5),
	)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 7, acceptedShare: null, isConnectedRecipient: false })).toBe(
		PLUS_BASE,
	)
})

// a sender below a fifth accepted has their limit halved, and at the fifth it holds
test("the reputation factor halves a mostly declined or ignored sender", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 0.1, isConnectedRecipient: false })).toBe(
		Math.floor(FREE_BASE / 2),
	)
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 0.2, isConnectedRecipient: false })).toBe(
		FREE_BASE,
	)
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 1, isConnectedRecipient: false })).toBe(
		FREE_BASE,
	)
})

// both factors together still leave at least one invite a day, so a mistake is recoverable
test("both factors together never take an account below one", () => {
	// a young account with nothing accepted takes a fifth and then a half, floored at one
	const youngAndUnpopular = Math.max(1, Math.floor(FREE_BASE / 5 / 2))
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: 0, isConnectedRecipient: false })).toBe(
		youngAndUnpopular,
	)
	expect(youngAndUnpopular).toBeGreaterThanOrEqual(1)
})

// a connected recipient doubles whatever the factors left
test("a connected recipient doubles the limit", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: true })).toBe(
		FREE_BASE * 2,
	)
	// the doubling applies after the floor, so the most reduced account doubles too
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: 0, isConnectedRecipient: true })).toBe(
		Math.max(1, Math.floor(FREE_BASE / 5 / 2)) * 2,
	)
})
