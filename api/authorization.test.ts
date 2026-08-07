// authorization gate tests for the manual-scan decision, the effective budget, and the single-gate rule
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isDailyFrequency } from "@shared/enums"
import { ADMIN_BUDGET_CENTS, ADMIN_QUOTA, PLANS } from "@shared/plans"
import {
	authorizeDailyFrequency,
	authorizeManualScan,
	type Capability,
	effectiveBudgetCents,
	isAdminRole,
} from "./authorization"

// an authorizeManualScan input for a non-admin owner within the daily limit for test cases to override.
// it bills yearly, so a test case has to opt into monthly to get the billing interval that supports overage
function scanInput(
	overrides: Partial<Parameters<typeof authorizeManualScan>[0]>,
): Parameters<typeof authorizeManualScan>[0] {
	return {
		isAdmin: false,
		plan: "free",
		isOwner: true,
		scansUsedToday: 0,
		hasPaymentMethod: false,
		billingInterval: "yearly",
		...overrides,
	}
}

// the effective budget is the per-user override when set, otherwise it's the plan's monthly backstop
test("effectiveBudgetCents uses the override when set, otherwise it's the plan backstop", () => {
	// a null override falls back to the plan's monthly backstop
	expect(effectiveBudgetCents({ isAdmin: false, plan: "free", budgetOverrideCents: null })).toBe(
		PLANS.free.monthlyBudgetCents,
	)
	expect(effectiveBudgetCents({ isAdmin: false, plan: "premium", budgetOverrideCents: null })).toBe(
		PLANS.premium.monthlyBudgetCents,
	)
	// a set override wins in both directions, above or below the plan value
	expect(effectiveBudgetCents({ isAdmin: false, plan: "free", budgetOverrideCents: 5000 })).toBe(5000)
	expect(effectiveBudgetCents({ isAdmin: false, plan: "premium", budgetOverrideCents: 100 })).toBe(100)
})

// an admin bypasses the topic and scan caps, so their spend backstop has to clear their plan's too
test("effectiveBudgetCents gives an admin the admin backstop overriding their plan", () => {
	// an admin on the lowest plan still gets the admin backstop, well above that plan's limit
	expect(effectiveBudgetCents({ isAdmin: true, plan: "free", budgetOverrideCents: null })).toBe(ADMIN_BUDGET_CENTS)
	expect(ADMIN_BUDGET_CENTS).toBeGreaterThan(PLANS.premium.monthlyBudgetCents)
	// an override is deliberate, so it caps an admin too
	expect(effectiveBudgetCents({ isAdmin: true, plan: "free", budgetOverrideCents: 500 })).toBe(500)
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
	expect(authorizeManualScan(scanInput({ isOwner: false }))).toEqual({ status: "forbidden" })

	// the monthly and yearly intervals are read as separate allowances, so a yearly subscriber is never held to the monthly number
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

// the daily scan limit is only soft when the extra scan can actually be billed with a card on file,
// and a subscription that includes the metered overage price for the charge to land on
test("authorizeManualScan only makes the daily limit soft when the extra scan can be billed", () => {
	const atLimit = { scansUsedToday: PLANS.free.dailyScanLimit.yearly }
	// at the daily limit without a payment method, the scan is rejected
	expect(authorizeManualScan(scanInput(atLimit))).toEqual({ status: "quota" })

	// a yearly subscription includes no overage price, so a card alone does not soften the limit.
	// allowing it would meter usage in Stripe that no subscription item ever bills
	expect(authorizeManualScan(scanInput({ ...atLimit, hasPaymentMethod: true }))).toEqual({ status: "quota" })

	// a monthly subscription includes the overage price, but without a card there is nothing to charge
	expect(authorizeManualScan(scanInput({ ...atLimit, billingInterval: "monthly" }))).toEqual({ status: "quota" })

	// with both, the scan is allowed and flagged as billable overage
	expect(authorizeManualScan(scanInput({ ...atLimit, hasPaymentMethod: true, billingInterval: "monthly" }))).toEqual({
		status: "allowed",
		remainingScans: 0,
		isOverage: true,
	})
})

// the platform lets an admin override ownership and the daily limit
test("authorizeManualScan lets an admin bypass every limit", () => {
	// an admin scans any topic regardless of ownership or how many scans ran today
	expect(authorizeManualScan(scanInput({ isAdmin: true, isOwner: false, scansUsedToday: 999 }))).toEqual({
		status: "allowed",
		remainingScans: ADMIN_QUOTA,
		isOverage: false,
	})
})

// the daily topic limit is what determines whether the monthly budget survives the month
// the gate holds the count of topics already on a daily frequency against the plan's limit for monthly or yearly
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

	// an admin bypasses the cap like every other quota
	expect(authorizeDailyFrequency({ ...freeMonthly, isAdmin: true, dailyTopicsUsed: 999 })).toBe(true)
})

// weekdays draws on the same cap as daily
test("isDailyFrequency counts daily and weekdays, never weekly", () => {
	expect(isDailyFrequency("daily")).toBe(true)
	expect(isDailyFrequency("weekdays")).toBe(true)
	expect(isDailyFrequency("weekly")).toBe(false)
})

// restrict what can be done from the topic chat
test("the capability union covers chat send and persist", () => {
	const chatCapabilities: Capability[] = ["chat:send", "chat:persist"]
	expect(chatCapabilities).toHaveLength(2)
})

// no api file outside authorization.ts compares role or plan with ===, so authority can't scatter across the api
test("role and plan === checks live only in the authorization gate module", () => {
	// every api source file, minus the gate itself, its build output, and the tests
	const files = readdirSync(import.meta.dir, { recursive: true })
		.map((entry) => String(entry))
		.filter(
			(name) =>
				name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.includes(".tsbuild") && name !== "authorization.ts",
		)

	// no file outside the gate uses === on role or plan
	const offenders = files.filter((name) =>
		/\b(role|plan|tier)\s*===/.test(readFileSync(join(import.meta.dir, name), "utf8")),
	)
	expect(offenders).toEqual([])
})
