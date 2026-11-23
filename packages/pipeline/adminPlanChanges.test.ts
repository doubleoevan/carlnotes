// admin plan change tests: an admin plan change writes the plan through the billing projection and logs it, resizes the
// LiteLLM key, clears on the free plan, is rejected for a user that Stripe bills, and gives way to a Stripe subscription
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { BillingSubscriptionProvider, Plan } from "@carlnotes/contracts/plans"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as litellm from "@carlnotes/models/litellm"
import { changeUserPlan } from "./adminPlanChanges"
import { applyBillingProjection } from "./billingProjection"

// put the connection pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the user's plan and billing row before the admin plan change
type PlanChangeDatabase = {
	planBefore?: Plan
	billingRow?: { provider: BillingSubscriptionProvider; plan: Plan }
}

// stub the database with the user's rows, and spy on the key's budget check and reissue
function stubPlanChangeDatabase({ planBefore = "free", billingRow }: PlanChangeDatabase = {}) {
	// user-1 exists, with its plan and its billing row as the projection reads it
	const rowsByQueryStart: [string, unknown[]][] = [
		['select "id" from "users"', [["user-1"]]],
		['select "plan" from "users"', [[planBefore]]],
		['select "provider" from "billing_subscriptions"', billingRow ? [[billingRow.provider]] : []],
		[
			'select "provider", "plan", "stripe_subscription_id"',
			billingRow ? [[billingRow.provider, billingRow.plan, "sub_1"]] : [],
		],
	]

	// each read returns its rows, and every write returns nothing
	const sentQueries = stubConnectionPool(
		(sentQuery) => rowsByQueryStart.find(([queryStart]) => sentQuery.text.startsWith(queryStart))?.[1] ?? [],
	)

	// the key's budget is current, and its reissue succeeds
	spyOn(litellm, "isUserLiteLLMKeyBudgetStale").mockResolvedValue(false)
	const replaceUserLiteLLMKeySpy = spyOn(litellm, "replaceUserLiteLLMKey").mockResolvedValue(true)
	return { sentQueries, replaceUserLiteLLMKeySpy }
}

// the first query sent that starts with the given text
function findQuery(sentQueries: SentQuery[], queryStart: string): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith(queryStart))
}

// an admin plan change of a free user writes an admin billing row with no end, sets the plan, and logs the admin
test("an admin plan change sets the user's plan through the billing projection and logs who set it", async () => {
	const { sentQueries } = stubPlanChangeDatabase()
	const planChangeResult = await changeUserPlan({ userId: "user-1", adminUserId: "admin-1", plan: "premium" })

	// the admin billing row, the plan, and the log row
	expect(planChangeResult).toBe("changed")
	const billingInsert = findQuery(sentQueries, 'insert into "billing_subscriptions"')
	expect(billingInsert?.values).toEqual(expect.arrayContaining(["admin", "premium", "user-1"]))
	expect(findQuery(sentQueries, 'update "users" set "plan"')?.values).toEqual(expect.arrayContaining(["premium"]))
	const logInsert = findQuery(sentQueries, 'insert into "admin_plan_changes"')
	expect(logInsert?.values).toEqual(expect.arrayContaining(["user-1", "admin-1", "premium"]))
})

// the admin plan change changed the plan, so the key is reissued at the new plan's budget
test("an admin plan change that changes the plan resizes the LiteLLM key budget", async () => {
	const { replaceUserLiteLLMKeySpy } = stubPlanChangeDatabase()
	await changeUserPlan({ userId: "user-1", adminUserId: "admin-1", plan: "plus" })
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")
})

// the free plan clears the admin billing row and returns the user to free
test("an admin plan change to the free plan clears the admin billing row", async () => {
	const { sentQueries } = stubPlanChangeDatabase({
		planBefore: "premium",
		billingRow: { provider: "admin", plan: "premium" },
	})
	expect(await changeUserPlan({ userId: "user-1", adminUserId: "admin-1", plan: "free" })).toBe("changed")
	expect(findQuery(sentQueries, 'delete from "billing_subscriptions"')).toBeDefined()
	expect(findQuery(sentQueries, 'update "users" set "plan"')?.values).toEqual(expect.arrayContaining(["free"]))
})

// a user that Stripe bills keeps their plan: nothing is written, logged, or reissued
test("an admin plan change is rejected for a user with an active Stripe subscription", async () => {
	const { sentQueries, replaceUserLiteLLMKeySpy } = stubPlanChangeDatabase({
		planBefore: "plus",
		billingRow: { provider: "stripe", plan: "plus" },
	})
	const planChangeResult = await changeUserPlan({ userId: "user-1", adminUserId: "admin-1", plan: "premium" })
	expect(planChangeResult).toBe("billed")

	// no write and no key reissue
	expect(sentQueries.filter((sentQuery) => /^(insert|update|delete)/.test(sentQuery.text))).toEqual([])
	expect(replaceUserLiteLLMKeySpy).not.toHaveBeenCalled()
})

// a Stripe row that arrives between the admin plan change's read and its write still rejects the admin plan change
// inside the projection
test("an admin projection never replaces a Stripe billing row", async () => {
	const { sentQueries } = stubPlanChangeDatabase({
		planBefore: "plus",
		billingRow: { provider: "stripe", plan: "plus" },
	})
	const isApplied = await applyBillingProjection({
		userId: "user-1",
		providers: ["admin"],
		projection: {
			provider: "admin",
			plan: "premium",
			status: "active",
			providerCustomerId: "user-1",
			providerSubscriptionId: "change-1",
			currentPeriodEnd: null,
			hasPaymentMethod: false,
			billingInterval: "monthly",
		},
	})
	expect(isApplied).toBe(false)
	expect(findQuery(sentQueries, 'insert into "billing_subscriptions"')).toBeUndefined()
})

// a user with an admin plan change who subscribes through Stripe leaves the admin plan change for that subscription
test("a Stripe subscription replaces an admin plan change", async () => {
	const { sentQueries } = stubPlanChangeDatabase({
		planBefore: "premium",
		billingRow: { provider: "admin", plan: "premium" },
	})
	const isApplied = await applyBillingProjection({
		userId: "user-1",
		providers: ["stripe"],
		projection: {
			provider: "stripe",
			plan: "plus",
			status: "active",
			providerCustomerId: "cus_1",
			providerSubscriptionId: "sub_1",
			currentPeriodEnd: null,
			hasPaymentMethod: true,
			billingInterval: "monthly",
		},
	})
	expect(isApplied).toBe(true)
	expect(findQuery(sentQueries, 'insert into "billing_subscriptions"')?.values).toEqual(
		expect.arrayContaining(["stripe", "plus"]),
	)
})
