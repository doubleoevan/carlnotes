// store billing route tests over a stubbed RevenueCat customer and database: the webhook's duplicate and late
// deliveries, a transfer, an unknown user, the Authorization check, and a RevenueCat failure. the store sync with the
// provider conflict rule and sandbox purchases. the store and web checkouts, and the stale store row that the account
// page re-reads
import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { loadBillingState } from "./billing"
import { billingRoute } from "./billingRoute"
import { deleteRevenueCatCustomer } from "./storeBilling"
import {
	LAST_MONTH,
	PLUS_MONTHLY,
	postRevenueCatEvent,
	postStoreSync,
	stubStoreSync,
	toBillingWrites,
	toRevenueCatCustomer,
} from "./storeBillingTestFixtures"
import { toSignedInApp } from "./testSession"

// the RevenueCat values, the environment, the Stripe key, and an in-memory Redis for the rate limit, put back after
// each test with the pool and the spies
const restoreEnvSettings = saveEnvSettings([
	"REVENUECAT_SECRET_API_KEY",
	"REVENUECAT_WEBHOOK_AUTHORIZATION",
	"REVENUECAT_SANDBOX_USER_IDS",
	"DOPPLER_ENVIRONMENT",
	"STRIPE_SECRET_KEY",
])
beforeEach(() => {
	stubRedisClient()
})

// put the settings, the pool, the Redis client, and the spies back
afterEach(() => {
	restoreEnvSettings()
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// a store row two days past its period end, as the account page reads it
function toStaleStoreRow(): unknown[] {
	const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
	return ["app_store", "active", twoDaysAgo, true, "monthly"]
}

// a renewal delivered twice and an older event after it all project the customer's current record
test("a duplicate and a late webhook converge on the current record", async () => {
	const { sentQueries, fetchSpy } = stubStoreSync(
		{ "user-1": toRevenueCatCustomer(PLUS_MONTHLY) },
		{ planBeforeSync: "plus" },
	)

	// a renewal twice, then the initial purchase late
	for (const type of ["RENEWAL", "RENEWAL", "INITIAL_PURCHASE"]) {
		const response = await postRevenueCatEvent({ type, app_user_id: "revenuecat-user-1" }, "Bearer webhook-secret")
		expect(response.status).toBe(200)
	}

	// each delivery read the record and upserted the same row
	expect(fetchSpy).toHaveBeenCalledTimes(3)
	expect(toBillingWrites(sentQueries)).toEqual(["insert", "insert", "insert"])

	// every upsert wrote the same values, apart from the new row id and the update time
	const upsertValues = sentQueries
		.filter((sentQuery) => sentQuery.text.startsWith('insert into "billing_subscriptions"'))
		.map((sentQuery) => JSON.stringify(sentQuery.values.slice(1, -1)))
	expect(new Set(upsertValues).size).toBe(1)
})

// a new purchase upserts the row and reissues the key at the plan's budget
test("a purchase webhook upserts the row and reissues the key", async () => {
	const { sentQueries, replaceUserLiteLLMKeySpy } = stubStoreSync({ "user-1": toRevenueCatCustomer(PLUS_MONTHLY) })
	const response = await postRevenueCatEvent(
		{ type: "INITIAL_PURCHASE", app_user_id: "revenuecat-user-1" },
		"Bearer webhook-secret",
	)
	expect(response.status).toBe(200)
	expect(toBillingWrites(sentQueries)).toEqual(["insert"])
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")

	// the projection locks the user's row, so a user's projections apply one at a time
	const userPlanRead = sentQueries.find((sentQuery) => sentQuery.text.startsWith('select "plan" from "users"'))
	expect(userPlanRead?.text).toEndWith("for no key update")
})

// an expiration after a refund clears the row, and the user reads free
test("an expiration webhook clears the store row", async () => {
	const { sentQueries, replaceUserLiteLLMKeySpy } = stubStoreSync(
		{ "user-1": toRevenueCatCustomer({ ...PLUS_MONTHLY, expiresDate: LAST_MONTH }) },
		{ planBeforeSync: "plus", billingRow: { provider: "app_store", plan: "plus" } },
	)
	const response = await postRevenueCatEvent(
		{ type: "EXPIRATION", app_user_id: "revenuecat-user-1" },
		"Bearer webhook-secret",
	)
	expect(response.status).toBe(200)
	expect(toBillingWrites(sentQueries)).toEqual(["delete"])
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")
})

// a transfer re-reads both sides: the source loses the plan and the destination gains it
test("a transfer webhook re-reads both users", async () => {
	const { sentQueries, fetchSpy } = stubStoreSync(
		{ "user-1": toRevenueCatCustomer(), "user-2": toRevenueCatCustomer(PLUS_MONTHLY) },
		{ userIds: ["user-1", "user-2"], billingRow: { provider: "app_store", plan: "plus" } },
	)
	const response = await postRevenueCatEvent(
		{ type: "TRANSFER", transferred_from: ["revenuecat-user-1"], transferred_to: ["revenuecat-user-2"] },
		"Bearer webhook-secret",
	)
	expect(response.status).toBe(200)
	expect(fetchSpy).toHaveBeenCalledTimes(2)
	expect(toBillingWrites(sentQueries)).toEqual(["delete", "insert"])
})

// a closing account's RevenueCat customer is deleted by its RevenueCat app user id, and a deployment without the
// secret key sends nothing
test("deleteRevenueCatCustomer deletes the user's RevenueCat customer", async () => {
	const { fetchSpy } = stubStoreSync({ "user-1": toRevenueCatCustomer() })
	await deleteRevenueCatCustomer("user-1")
	delete Bun.env.REVENUECAT_SECRET_API_KEY
	await deleteRevenueCatCustomer("user-1")
	expect(fetchSpy.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
		["https://api.revenuecat.com/v1/subscribers/revenuecat-user-1", "DELETE"],
	])
})

// an app user id that is not a user, like the dashboard's test event, responds 200 and is never read
test("a webhook for an unknown app user id responds 200 and writes nothing", async () => {
	const { sentQueries, fetchSpy } = stubStoreSync({}, { userIds: [] })
	const response = await postRevenueCatEvent({ type: "TEST", app_user_id: "not-a-user" }, "Bearer webhook-secret")
	expect(response.status).toBe(200)
	expect(fetchSpy).not.toHaveBeenCalled()
	expect(toBillingWrites(sentQueries)).toEqual([])
})

// a missing or wrong Authorization value, or a body that is not an event, is rejected with a 400 and reported
test("a webhook with a missing or wrong Authorization value is rejected with a 400", async () => {
	const { sentQueries, fetchSpy, reportErrorSpy } = stubStoreSync({ "user-1": toRevenueCatCustomer(PLUS_MONTHLY) })
	const missingResponse = await postRevenueCatEvent({ type: "RENEWAL", app_user_id: "revenuecat-user-1" })
	const wrongResponse = await postRevenueCatEvent({ type: "RENEWAL", app_user_id: "revenuecat-user-1" }, "Bearer guess")
	const malformedResponse = await billingRoute.request("/webhooks/revenuecat", {
		method: "POST",
		headers: { authorization: "Bearer webhook-secret" },
		body: "not json",
	})

	// all three are rejected and reported, and nothing is read or written
	expect([missingResponse.status, wrongResponse.status, malformedResponse.status]).toEqual([400, 400, 400])
	expect(reportErrorSpy.mock.calls.map((reportErrorCall) => reportErrorCall[2])).toEqual(
		Array(3).fill({ outcome: "rejected" }),
	)
	expect(fetchSpy).not.toHaveBeenCalled()
	expect(toBillingWrites(sentQueries)).toEqual([])
})

// a RevenueCat read that fails responds 500, so RevenueCat sends the event again
test("a webhook whose customer read fails responds 500 and is reported", async () => {
	const { sentQueries, reportErrorSpy } = stubStoreSync({ "user-1": "unreachable" })
	const response = await postRevenueCatEvent(
		{ type: "RENEWAL", app_user_id: "revenuecat-user-1" },
		"Bearer webhook-secret",
	)
	expect(response.status).toBe(500)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ outcome: "failed" })
	expect(toBillingWrites(sentQueries)).toEqual([])
})

// a premium store subscription replaces a plus Stripe row, the conflict is reported with both ids, and the Stripe
// subscription stops at its period end
test("a higher store plan replaces a Stripe row, reports the conflict, and cancels the Stripe renewal", async () => {
	const premiumMonthly = { entitlementId: "premium", productId: "carlnotes.premium.monthly" }
	const { sentQueries, reportErrorSpy, stripeSubscriptionUpdateSpy } = stubStoreSync(
		{ "user-1": toRevenueCatCustomer(premiumMonthly) },
		{ planBeforeSync: "plus", billingRow: { provider: "stripe", plan: "plus" } },
	)
	const response = await postStoreSync("USA")
	expect(response.status).toBe(200)
	expect(toBillingWrites(sentQueries)).toEqual(["insert"])
	expect(reportErrorSpy.mock.calls[0]?.[2]).toMatchObject({
		currentProvider: "stripe",
		currentSubscriptionId: "sub_1",
		projectedProvider: "app_store",
	})
	expect(stripeSubscriptionUpdateSpy.mock.calls).toEqual([["sub_1", { cancel_at_period_end: true }]])
})

// a failed Stripe cancel is reported with the subscription id, and the store plan still applies
test("a failed cancel of the replaced Stripe subscription is reported", async () => {
	const premiumMonthly = { entitlementId: "premium", productId: "carlnotes.premium.monthly" }
	const { sentQueries, reportErrorSpy, stripeSubscriptionUpdateSpy } = stubStoreSync(
		{ "user-1": toRevenueCatCustomer(premiumMonthly) },
		{ planBeforeSync: "plus", billingRow: { provider: "stripe", plan: "plus" } },
	)
	stripeSubscriptionUpdateSpy.mockRejectedValue(new Error("stripe unavailable"))
	const response = await postStoreSync("USA")
	expect(response.status).toBe(200)
	expect(toBillingWrites(sentQueries)).toEqual(["insert"])
	expect(reportErrorSpy.mock.calls.at(-1)?.[2]).toEqual({ userId: "user-1", stripeSubscriptionId: "sub_1" })
})

// an equal store plan keeps the Stripe row, and a cleared store record never clears a Stripe row
test("an equal store plan keeps the Stripe row, and an empty record leaves it alone", async () => {
	const { sentQueries, reportErrorSpy, stripeSubscriptionUpdateSpy } = stubStoreSync(
		{ "user-1": toRevenueCatCustomer(PLUS_MONTHLY), "user-2": toRevenueCatCustomer() },
		{ userIds: ["user-1", "user-2"], planBeforeSync: "plus", billingRow: { provider: "stripe", plan: "plus" } },
	)
	const equalResponse = await postRevenueCatEvent(
		{ type: "RENEWAL", app_user_id: "revenuecat-user-1" },
		"Bearer webhook-secret",
	)
	const emptyResponse = await postRevenueCatEvent(
		{ type: "EXPIRATION", app_user_id: "revenuecat-user-2" },
		"Bearer webhook-secret",
	)

	// neither wrote or canceled the Stripe subscription, and only the equal plan was a conflict
	expect([equalResponse.status, emptyResponse.status]).toEqual([200, 200])
	expect(toBillingWrites(sentQueries)).toEqual([])
	expect(stripeSubscriptionUpdateSpy).not.toHaveBeenCalled()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

// outside dev, a sandbox purchase by a user who is not listed grants no plan and reissues no key
test("a production sync ignores an unlisted user's sandbox purchase", async () => {
	Bun.env.DOPPLER_ENVIRONMENT = "prd"
	Bun.env.REVENUECAT_SANDBOX_USER_IDS = "app-review"
	const { sentQueries, replaceUserLiteLLMKeySpy } = stubStoreSync({
		"user-1": toRevenueCatCustomer({ ...PLUS_MONTHLY, isSandbox: true }),
	})
	const response = await postStoreSync()
	expect(response.status).toBe(200)
	expect(toBillingWrites(sentQueries)).toEqual(["delete"])
	expect(replaceUserLiteLLMKeySpy).not.toHaveBeenCalled()
})

// the sync route needs a session, and a failed read keeps the row and responds 502
test("the store sync rejects a visitor and reports a failed read", async () => {
	const { sentQueries, reportErrorSpy } = stubStoreSync({ "user-1": "unreachable" })
	const visitorResponse = await billingRoute.request("/billing/store/sync", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "{}",
	})
	const failedResponse = await postStoreSync()
	expect(visitorResponse.status).toBe(401)
	expect(failedResponse.status).toBe(502)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ outcome: "store sync failed" })
	expect(toBillingWrites(sentQueries)).toEqual([])
})

// the store purchase start is recorded from the app alone
test("the store checkout record needs a session and the app", async () => {
	stubStoreSync({})
	const storeCheckout = JSON.stringify({ plan: "plus", billingInterval: "monthly", storefrontCountryCode: "DEU" })
	const signedInApp = toSignedInApp(billingRoute, "user-1")
	const browserResponse = await signedInApp.request("/billing/store/checkout", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: storeCheckout,
	})
	const appResponse = await signedInApp.request("/billing/store/checkout", {
		method: "POST",
		headers: { "content-type": "application/json", "x-carlnotes-platform": "ios" },
		body: storeCheckout,
	})
	expect(browserResponse.status).toBe(400)
	expect(appResponse.status).toBe(200)
	expect(await appResponse.json()).toEqual({ ok: true })
})

// a store subscriber's web checkout is rejected before Stripe is reached
test("the web checkout rejects a store subscriber with a 409", async () => {
	delete Bun.env.STRIPE_SECRET_KEY
	stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith('select "provider", "status"') ? [toStaleStoreRow()] : [],
	)
	const response = await toSignedInApp(billingRoute, "user-1").request("/billing/checkout", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ plan: "premium", billingInterval: "monthly" }),
	})
	expect(response.status).toBe(409)
})

// a store row two days past its period end re-reads the customer, and the cleared row leaves the user free
test("the account page re-reads a store row whose period ended over a day ago", async () => {
	const { fetchSpy } = stubStoreSync({ "user-1": toRevenueCatCustomer({ ...PLUS_MONTHLY, expiresDate: LAST_MONTH }) })

	// the account page's row, the sync's row, and the user's plan, each read before and after the sync's delete
	const staleRowResults: [string, { beforeDelete: unknown[][]; afterDelete: unknown[][] }][] = [
		['select "provider", "status"', { beforeDelete: [toStaleStoreRow()], afterDelete: [] }],
		[
			'select "provider", "plan", "stripe_subscription_id"',
			{ beforeDelete: [["app_store", "plus", "transaction-1"]], afterDelete: [] },
		],
		['select "plan" from "users"', { beforeDelete: [["plus"]], afterDelete: [["free"]] }],
		[
			'select "plan", "revenuecat_app_user_id" from "users"',
			{ beforeDelete: [["plus", "revenuecat-user-1"]], afterDelete: [["free", "revenuecat-user-1"]] },
		],
		['select "revenuecat_app_user_id" from "users"', { beforeDelete: [["revenuecat-user-1"]], afterDelete: [] }],
	]

	// the row reads stale until the sync deletes it, and today's scan count is zero
	let isRowDeleted = false
	stubConnectionPool((sentQuery) => {
		if (sentQuery.text.startsWith('delete from "billing_subscriptions"')) {
			isRowDeleted = true
		}

		// each stale row query reads its result for the side of the delete the sync is on
		const staleRowResult = staleRowResults.find(([queryStart]) => sentQuery.text.startsWith(queryStart))?.[1]
		if (staleRowResult) {
			return isRowDeleted ? staleRowResult.afterDelete : staleRowResult.beforeDelete
		}
		return sentQuery.text.includes("count(") ? [[0]] : []
	})

	// the account page re-read RevenueCat once, and the cleared row left the user free
	const billingState = await loadBillingState("user-1")
	expect(fetchSpy).toHaveBeenCalledTimes(1)
	expect(billingState).toMatchObject({ plan: "free", provider: null, status: null, isOverageBillable: false })
})

// a failed re-read is reported, and the account page reads the stored row instead of failing
test("the account page reads the stored row if the re-read fails", async () => {
	// RevenueCat fails, and the database holds a stale store row
	const { reportErrorSpy } = stubStoreSync({ "user-1": "unreachable" })
	stubConnectionPool((sentQuery) => {
		if (sentQuery.text.startsWith('select "provider", "status"')) {
			return [toStaleStoreRow()]
		}

		// the user's plan and RevenueCat app user id, and a zero count for every scan count
		if (sentQuery.text.startsWith('select "plan", "revenuecat_app_user_id" from "users"')) {
			return [["plus", "revenuecat-user-1"]]
		}
		if (sentQuery.text.startsWith('select "revenuecat_app_user_id" from "users"')) {
			return [["revenuecat-user-1"]]
		}
		return sentQuery.text.includes("count(") ? [[0]] : []
	})

	// the stored plus row is read, and the failure is reported
	const billingState = await loadBillingState("user-1")
	expect(billingState).toMatchObject({
		plan: "plus",
		provider: "app_store",
		status: "active",
		revenueCatAppUserId: "revenuecat-user-1",
	})
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ outcome: "stale store row read failed" })
})
