// admin plan change tests: an admin plan change writes the plan through the billing projection and logs it, resizes the
// LiteLLM key, ends once its end date passes unless it was granted again, is rejected for a user that Stripe bills, and
// gives way to a Stripe subscription
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { BillingSubscriptionProvider, Plan } from "@carlnotes/contracts/plans"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as litellm from "@carlnotes/models/litellm"
import { changeUserPlan, endExpiredAdminPlanChanges } from "./adminPlanChanges"
import { applyBillingProjection } from "./billingProjection"

// put the connection pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the user's plan and billing row before the admin plan change, and the admin billing rows past their end date
type PlanChangeDatabase = {
	planBefore?: Plan
	billingRow?: { provider: BillingSubscriptionProvider; plan: Plan; subscriptionId?: string }
	expiredAdminPlanChanges?: { userId: string; adminPlanChangeId: string }[]
}

// stub the database with the user's rows, and spy on the key's budget check and reissue
function stubPlanChangeDatabase({
	planBefore = "free",
	billingRow,
	expiredAdminPlanChanges = [],
}: PlanChangeDatabase = {}) {
	// user-1 exists, with its plan, its billing row as the admin plan change and the projection read it, and the expired
	// admin billing rows
	const rowsByQueryStart: [string, unknown[]][] = [
		['select "id" from "users"', [["user-1"]]],
		['select "plan" from "users"', [[planBefore]]],
		['select "provider" from "billing_subscriptions"', billingRow ? [[billingRow.provider]] : []],
		[
			'select "provider", "plan", "stripe_subscription_id"',
			billingRow ? [[billingRow.provider, billingRow.plan, billingRow.subscriptionId ?? "sub_1"]] : [],
		],
		[
			'select "user_id", "stripe_subscription_id" from "billing_subscriptions"',
			expiredAdminPlanChanges.map(({ userId, adminPlanChangeId }) => [userId, adminPlanChangeId]),
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

// an admin plan change of a free user writes an admin billing row ending at the end date, sets the plan, and logs the
// reason
test("an admin plan change sets the user's plan through the billing projection and logs who granted it and why", async () => {
	const { sentQueries } = stubPlanChangeDatabase()
	const endsAt = new Date("2027-01-01T00:00:00Z")
	const planChangeResult = await changeUserPlan({
		userId: "user-1",
		adminUserId: "admin-1",
		plan: "premium",
		reason: "Claude Connectors Directory reviewer",
		endsAt,
	})

	// the admin billing row, the plan, and the log row
	expect(planChangeResult).toBe("changed")
	const billingInsert = findQuery(sentQueries, 'insert into "billing_subscriptions"')
	expect(billingInsert?.values).toEqual(expect.arrayContaining(["admin", "premium", "user-1", endsAt.toISOString()]))
	expect(findQuery(sentQueries, 'update "users" set "plan"')?.values).toEqual(expect.arrayContaining(["premium"]))
	const logInsert = findQuery(sentQueries, 'insert into "admin_plan_changes"')
	expect(logInsert?.values).toEqual(
		expect.arrayContaining(["user-1", "admin-1", "premium", "Claude Connectors Directory reviewer"]),
	)
})

// the admin plan change changed the plan, so the key is reissued at the new plan's budget
test("an admin plan change that changes the plan resizes the LiteLLM key budget", async () => {
	const { replaceUserLiteLLMKeySpy } = stubPlanChangeDatabase()
	await changeUserPlan({ userId: "user-1", adminUserId: "admin-1", plan: "plus", reason: "Beta tester", endsAt: null })
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")
})

// an admin plan change past its end date clears the admin billing row, returns the user to free, and resizes the key
test("an expired admin plan change returns the user to the free plan and resizes the key", async () => {
	const { sentQueries, replaceUserLiteLLMKeySpy } = stubPlanChangeDatabase({
		planBefore: "premium",
		billingRow: { provider: "admin", plan: "premium", subscriptionId: "change-1" },
		expiredAdminPlanChanges: [{ userId: "user-1", adminPlanChangeId: "change-1" }],
	})
	const endedCount = await endExpiredAdminPlanChanges(new Date("2027-01-02T00:00:00Z"))

	// the expired rows were read by provider and end date, then cleared through the projection
	expect(endedCount).toBe(1)
	expect(
		findQuery(sentQueries, 'select "user_id", "stripe_subscription_id" from "billing_subscriptions"')?.values,
	).toEqual(["admin", "2027-01-02T00:00:00.000Z"])
	expect(findQuery(sentQueries, 'delete from "billing_subscriptions"')).toBeDefined()
	expect(findQuery(sentQueries, 'update "users" set "plan"')?.values).toEqual(expect.arrayContaining(["free"]))
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")
})

// an admin plan change an admin granted again after the sweep read the expired one stays, with the plan and the key
// unchanged
test("the sweep keeps an admin plan change granted again after it read the expired one", async () => {
	const { sentQueries, replaceUserLiteLLMKeySpy } = stubPlanChangeDatabase({
		planBefore: "premium",
		billingRow: { provider: "admin", plan: "premium", subscriptionId: "change-2" },
		expiredAdminPlanChanges: [{ userId: "user-1", adminPlanChangeId: "change-1" }],
	})
	expect(await endExpiredAdminPlanChanges(new Date("2027-01-02T00:00:00Z"))).toBe(0)
	expect(findQuery(sentQueries, 'delete from "billing_subscriptions"')).toBeUndefined()
	expect(replaceUserLiteLLMKeySpy).not.toHaveBeenCalled()
})

// a user that Stripe bills keeps their plan: nothing is written, logged, or reissued
test("an admin plan change is rejected for a user with an active Stripe subscription", async () => {
	const { sentQueries, replaceUserLiteLLMKeySpy } = stubPlanChangeDatabase({
		planBefore: "plus",
		billingRow: { provider: "stripe", plan: "plus" },
	})
	const planChangeResult = await changeUserPlan({
		userId: "user-1",
		adminUserId: "admin-1",
		plan: "premium",
		reason: "Beta tester",
		endsAt: null,
	})
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
