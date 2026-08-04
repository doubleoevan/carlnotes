// authorization gate tests for the manual-scan decision, the effective budget, and the single-gate rule
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ADMIN_BUDGET_CENTS, ADMIN_QUOTA, PLANS } from "@shared/plans"
import { type Capability, decideManualScan, effectiveBudgetCents, isAdminRole } from "./authorization"

// a decideManualScan input for a non-admin owner within the daily limit and no payment method for test cases to override
function scanInput(overrides: Partial<Parameters<typeof decideManualScan>[0]>): Parameters<typeof decideManualScan>[0] {
	return { isAdmin: false, plan: "free", isOwner: true, scansUsedToday: 0, hasPaymentMethod: false, ...overrides }
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
	// an admin on the lowest plan still gets the admin backstop, well above that plan's ceiling
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
test("decideManualScan enforces owner authority and the daily limit", () => {
	// within the limit the scan is allowed, and remaining is the daily allowance after this scan
	expect(decideManualScan(scanInput({}))).toEqual({
		status: "allowed",
		remaining: PLANS.free.dailyScanLimit - 1,
		isOverage: false,
	})
	// a non-owner who is not an admin is refused before any quota check
	expect(decideManualScan(scanInput({ isOwner: false }))).toEqual({ status: "forbidden" })
})

// the daily scan limit is only soft with a payment method on file. without one it is a hard cap
test("decideManualScan only makes the daily limit soft with a payment method on file", () => {
	// at the daily limit without a payment method, the scan is refused
	expect(decideManualScan(scanInput({ scansUsedToday: PLANS.free.dailyScanLimit }))).toEqual({ status: "quota" })
	// at the daily limit with a payment method, the scan is allowed and flagged as billable overage
	expect(decideManualScan(scanInput({ scansUsedToday: PLANS.free.dailyScanLimit, hasPaymentMethod: true }))).toEqual({
		status: "allowed",
		remaining: 0,
		isOverage: true,
	})
})

// the platform lets an admin override ownership and the daily limit
test("decideManualScan lets an admin bypass every limit", () => {
	// an admin scans any topic regardless of ownership or how many scans ran today
	expect(decideManualScan(scanInput({ isAdmin: true, isOwner: false, scansUsedToday: 999 }))).toEqual({
		status: "allowed",
		remaining: ADMIN_QUOTA,
		isOverage: false,
	})
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
