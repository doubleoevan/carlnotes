// authorization gate tests for the manual-scan decision, the user's budget, the owner details, and the single-gate rule
import { afterEach, expect, test } from "bun:test"
import { isDailyFrequency } from "@carlnotes/contracts/enums"
import { ADMIN_BUDGET_CENTS, ADMIN_QUOTA, PLANS } from "@carlnotes/contracts/plans"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { listSourceFiles } from "@carlnotes/server/sourceFileTestFixtures"
import {
	authorizeDailyFrequency,
	authorizeManualScan,
	type Capability,
	isAdminRole,
	isAllowed,
	userBudgetCents,
} from "./authorization"

// put the connection pool's own query back after each test
afterEach(() => {
	restoreConnectionPool()
})

// an authorizeManualScan input for a non-admin owner within the daily limit for test cases to override
function scanInput(
	overrides: Partial<Parameters<typeof authorizeManualScan>[0]>,
): Parameters<typeof authorizeManualScan>[0] {
	return {
		isAdmin: false,
		plan: "free",
		isTopicOwner: true,
		scansUsedToday: 0,
		provider: "stripe",
		hasPaymentMethod: false,
		billingInterval: "yearly",
		...overrides,
	}
}

// the user's budget is the override when set, otherwise use the plan's monthly backstop
test("userBudgetCents uses the override when set, otherwise it's the plan backstop", () => {
	// a null override falls back to the plan's monthly backstop
	expect(userBudgetCents({ isAdmin: false, plan: "free", budgetOverrideCents: null })).toBe(
		PLANS.free.monthlyBudgetCents,
	)
	expect(userBudgetCents({ isAdmin: false, plan: "premium", budgetOverrideCents: null })).toBe(
		PLANS.premium.monthlyBudgetCents,
	)
	// a set override wins in both directions, above or below the plan value
	expect(userBudgetCents({ isAdmin: false, plan: "free", budgetOverrideCents: 5000 })).toBe(5000)
	expect(userBudgetCents({ isAdmin: false, plan: "premium", budgetOverrideCents: 100 })).toBe(100)
})

// an admin bypasses the topic and scan limits, so their spend backstop has to clear their plan's too
test("userBudgetCents gives an admin the admin backstop overriding their plan", () => {
	// an admin on the lowest plan still gets the admin backstop, well above that plan's limit
	expect(userBudgetCents({ isAdmin: true, plan: "free", budgetOverrideCents: null })).toBe(ADMIN_BUDGET_CENTS)
	expect(ADMIN_BUDGET_CENTS).toBeGreaterThan(PLANS.premium.monthlyBudgetCents)
	// an override is deliberate, so it limits an admin too
	expect(userBudgetCents({ isAdmin: true, plan: "free", budgetOverrideCents: 500 })).toBe(500)
})

// the role string is the only thing that grants admin authority
test("isAdminRole accepts only the admin role", () => {
	expect(isAdminRole("admin")).toBe(true)
	// a plain user, an unknown role, and a missing row all read as not an admin
	expect(isAdminRole("user")).toBe(false)
	expect(isAdminRole(undefined)).toBe(false)
})

// a non-admin owner may scan within the daily limit, and a non-owner is forbidden outright
test("authorizeManualScan enforces owner authority and the daily limit", () => {
	// within the limit the scan is allowed, and remainingScans is the daily allowance after this scan
	expect(authorizeManualScan(scanInput({ billingInterval: "monthly" }))).toEqual({
		status: "allowed",
		remainingScans: PLANS.free.dailyScanLimit.monthly - 1,
		isOverage: false,
	})
	// a non-owner who is not an admin is rejected before any quota check
	expect(authorizeManualScan(scanInput({ isTopicOwner: false }))).toEqual({ status: "forbidden" })

	// the monthly and yearly intervals are read as separate allowances
	const plusAtMonthlyLimit = { plan: "plus", scansUsedToday: PLANS.plus.dailyScanLimit.monthly } as const
	expect(authorizeManualScan(scanInput({ ...plusAtMonthlyLimit, billingInterval: "monthly" }))).toEqual({
		status: "quota",
	})
	expect(authorizeManualScan(scanInput({ ...plusAtMonthlyLimit, billingInterval: "yearly" }))).toEqual({
		status: "allowed",
		remainingScans: PLANS.plus.dailyScanLimit.yearly - PLANS.plus.dailyScanLimit.monthly - 1,
		isOverage: false,
	})
})

// the daily scan limit is only soft when the extra scan can actually be billed with a card on file
test("authorizeManualScan only makes the daily limit soft when the extra scan can be billed", () => {
	const atLimit = { scansUsedToday: PLANS.free.dailyScanLimit.yearly }
	// at the daily limit without a payment method, the scan is rejected
	expect(authorizeManualScan(scanInput(atLimit))).toEqual({ status: "quota" })

	// a yearly subscription includes no overage price, so a card alone does not soften the limit
	expect(authorizeManualScan(scanInput({ ...atLimit, hasPaymentMethod: true }))).toEqual({ status: "quota" })

	// a monthly subscription includes the overage price, but without a card there is nothing to charge
	expect(authorizeManualScan(scanInput({ ...atLimit, billingInterval: "monthly" }))).toEqual({ status: "quota" })

	// with both, the scan is allowed and flagged as billable overage
	expect(authorizeManualScan(scanInput({ ...atLimit, hasPaymentMethod: true, billingInterval: "monthly" }))).toEqual({
		status: "allowed",
		remainingScans: 0,
		isOverage: true,
	})

	// a monthly store subscription with a card has no metered price, so its limit stays hard
	const monthlyStoreAtLimit = { ...atLimit, hasPaymentMethod: true, billingInterval: "monthly" } as const
	expect(authorizeManualScan(scanInput({ ...monthlyStoreAtLimit, provider: "app_store" }))).toEqual({ status: "quota" })
	expect(authorizeManualScan(scanInput({ ...monthlyStoreAtLimit, provider: "play_store" }))).toEqual({
		status: "quota",
	})
})

// the platform lets an admin override ownership and the daily limit
test("authorizeManualScan lets an admin bypass every limit", () => {
	// an admin scans any topic regardless of ownership or how many scans ran today
	expect(authorizeManualScan(scanInput({ isAdmin: true, isTopicOwner: false, scansUsedToday: 999 }))).toEqual({
		status: "allowed",
		remainingScans: ADMIN_QUOTA,
		isOverage: false,
	})
})

// the daily topic limit is what determines whether the monthly budget survives the month the gate holds the count
test("authorizeDailyFrequency holds daily topics to the plan's limit at the user's billingInterval", () => {
	// under the limit one more topic may go daily, and at the limit it may not
	const freeMonthly = { isAdmin: false, plan: "free", billingInterval: "monthly" } as const
	expect(authorizeDailyFrequency({ ...freeMonthly, dailyTopicsUsed: PLANS.free.dailyTopicLimit.monthly - 1 })).toBe(
		true,
	)
	expect(authorizeDailyFrequency({ ...freeMonthly, dailyTopicsUsed: PLANS.free.dailyTopicLimit.monthly })).toBe(false)

	// a yearly subscriber reads the yearly number, which is the higher one on every paid plan
	const atPlusMonthlyLimit = { plan: "plus", dailyTopicsUsed: PLANS.plus.dailyTopicLimit.monthly } as const
	expect(authorizeDailyFrequency({ ...atPlusMonthlyLimit, isAdmin: false, billingInterval: "monthly" })).toBe(false)
	expect(authorizeDailyFrequency({ ...atPlusMonthlyLimit, isAdmin: false, billingInterval: "yearly" })).toBe(true)

	// an admin bypasses the limit like every other quota
	expect(authorizeDailyFrequency({ ...freeMonthly, isAdmin: true, dailyTopicsUsed: 999 })).toBe(true)
})

// weekdays draws on the same limit as daily
test("isDailyFrequency counts daily and weekdays, never weekly", () => {
	expect(isDailyFrequency("daily")).toBe(true)
	expect(isDailyFrequency("weekdays")).toBe(true)
	expect(isDailyFrequency("weekly")).toBe(false)
})

// a topic's costs, failure reasons, and generated context are its owner's, and an admin passes every capability
test("only the topic owner and an admin may view the owner details", async () => {
	// member-1 is on the team that owns the topic, admin-1's access row is an admin's, and every other user's is a free
	// user's
	stubConnectionPool(({ text, values }) => {
		if (text.includes('from "team_members"')) {
			return [["member-1", "member"]]
		}
		return values.includes("admin-1") ? [ADMIN_USER_ACCESS_ROW] : [FREE_USER_ACCESS_ROW]
	})
	const teamTopic = { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: "team-1" } as const

	// the owner and an admin may, and a member of the owning team and a signed-out visitor may not
	expect(await isAllowed("owner-1", "topic:viewOwnerDetails", teamTopic)).toBe(true)
	expect(await isAllowed("admin-1", "topic:viewOwnerDetails", teamTopic)).toBe(true)
	expect(await isAllowed("member-1", "topic:viewOwnerDetails", teamTopic)).toBe(false)
	expect(await isAllowed(null, "topic:viewOwnerDetails", teamTopic)).toBe(false)
})

// restrict what can be done from the topic chat
test("the capability union covers chat send and persist", () => {
	const chatCapabilities: Capability[] = ["chat:send", "chat:persist"]
	expect(chatCapabilities).toHaveLength(2)
})

// the gate module, the dev seed script, and the smoke section whose comparisons are assertions and not gates
const GATE_SCAN_SKIPPED_PATHS = [
	"apps/api/authorization.ts",
	"apps/api/seed.ts",
	"apps/api/team/teamTopicSmokeSections.ts",
]

// no api or web file outside the gate compares a role, a plan, or a tier with === or !==
test("role and plan comparisons live only in the gate modules", () => {
	// every api and web source file, minus the skipped ones
	const files = listSourceFiles(["apps/api", "apps/web/src"]).filter(
		({ path }) => !GATE_SCAN_SKIPPED_PATHS.includes(path),
	)

	// a name ending in role, plan, or tier in either case, such as teamRole or previousPlan, compared with === or !==, or
	// a role or plan literal compared with anything, such as a call's result. member is also a team status, so the
	// literal list leaves it to the name form
	const offenders = files
		.filter(({ text }) => /\b\w*(role|plan|tier)\s*[!=]==|[!=]==\s*"(leader|admin|free|plus|premium)"/i.test(text))
		.map(({ path }) => path)
	expect(offenders).toEqual([])
})
