// billing tests for the subscription projection that the webhook applies to billing_subscriptions, the webhook's
// responses: a 400 for a bad signature and a 500 for a verified event that could not be applied, the LiteLLM key
// that a plan change or a stale key budget reissues, and the 404 a non-admin gets for another user's billing state
import { afterEach, expect, type Mock, mock, spyOn, test } from "bun:test"
import type { Plan } from "@carlnotes/contracts/plans"
import { FREE_USER_ACCESS_ROW, restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { toEveryTimerInstantSetTimeout } from "@carlnotes/db/redisFakeServer"
import * as litellm from "@carlnotes/models/litellm"
import { toHmacDigest } from "@carlnotes/server/hmac"
import type * as monitoring from "@carlnotes/server/monitoring"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toPaidSubscription } from "./billing"
import { billingRoute } from "./billingRoute"
import { toSignedInApp } from "./testSession"

// the webhook's secret and the Stripe key, put back after each test with the pool and the spies
const restoreEnvSettings = saveEnvSettings(["STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"])
afterEach(() => {
	restoreEnvSettings()
	restoreConnectionPool()
	mock.restore()
})

// Stripe's signature header for a payload: the timestamp and the HMAC of "<timestamp>.<payload>" under the secret
function toStripeSignature(payload: string, secret: string): string {
	const timestamp = Math.floor(Date.now() / 1000)
	return `t=${timestamp},v1=${toHmacDigest({ value: `${timestamp}.${payload}`, secret, encoding: "hex" })}`
}

// configure the webhook, silence the route's log, and return the spy on the report
function configureWebhook(): Mock<typeof monitoring.reportError> {
	Bun.env.STRIPE_SECRET_KEY = "sk_test_key"
	Bun.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
	return quietErrorReports()
}

// post one webhook body, with a signature header if one is given
async function postWebhook(body: string, signature?: string): Promise<Response> {
	return await billingRoute.request("/webhooks/stripe", {
		method: "POST",
		headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) },
		body,
	})
}

// post a signed active subscription event on the plus plan for user-1. a renewal and an upgrade both arrive as
// customer.subscription.updated
async function postSignedPlusSubscriptionUpdate(): Promise<Response> {
	// the event, signed with the webhook's secret
	const payload = JSON.stringify({
		id: "evt_1",
		object: "event",
		type: "customer.subscription.updated",
		data: {
			object: { id: "sub_1", status: "active", customer: "cus_1", metadata: { userId: "user-1", plan: "plus" } },
		},
	})
	return await postWebhook(payload, toStripeSignature(payload, "whsec_test"))
}

// an unsigned or badly signed event is rejected with a 400, and the rejection is reported
test("an unsigned or badly signed webhook is rejected with a 400 and reported", async () => {
	const reportErrorSpy = configureWebhook()
	const unsignedResponse = await postWebhook("{}")
	const badlySignedResponse = await postWebhook("{}", "t=1,v1=00")

	// both are rejected, and each rejection is reported
	expect(unsignedResponse.status).toBe(400)
	expect(badlySignedResponse.status).toBe(400)
	expect(reportErrorSpy).toHaveBeenCalledTimes(2)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ outcome: "rejected" })
})

// an unset webhook secret responds 500 and is reported as failed, not rejected
test("a webhook with no secret configured responds 500 and is reported as failed", async () => {
	const reportErrorSpy = configureWebhook()
	delete Bun.env.STRIPE_WEBHOOK_SECRET
	const response = await postWebhook("{}", "t=1,v1=00")
	expect(response.status).toBe(500)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ outcome: "failed" })
})

// a verified event whose apply fails responds 500, and the failure is reported
test("a verified webhook whose apply fails responds 500 and is reported", async () => {
	const reportErrorSpy = configureWebhook()
	stubConnectionPool(() => {
		throw new Error("database unreachable")
	})

	// a subscription event for a user, signed with the secret
	const response = await postSignedPlusSubscriptionUpdate()
	expect(response.status).toBe(500)
	expect(await response.json()).toEqual({ error: "webhook failed" })
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ outcome: "failed" })
})

// the plan the user was on before the event, whether the key's budget is stale, and whether a key reissue succeeds
type PostPlusSubscriptionEventOptions = { planBeforeEvent: Plan; isKeyBudgetStale?: boolean; isKeyReissued?: boolean }

// the webhook's response, and the spies on the key's budget check and the key reissue
type PostPlusSubscriptionEventResult = {
	response: Response
	reportErrorSpy: Mock<typeof monitoring.reportError>
	isUserLiteLLMKeyBudgetStaleSpy: Mock<typeof litellm.isUserLiteLLMKeyBudgetStale>
	replaceUserLiteLLMKeySpy: Mock<typeof litellm.replaceUserLiteLLMKey>
}

// post a signed active subscription event on the plus plan for a user who was on planBeforeEvent, and return the response
// and the spies
async function postPlusSubscriptionEvent({
	planBeforeEvent,
	isKeyBudgetStale = false,
	isKeyReissued = true,
}: PostPlusSubscriptionEventOptions): Promise<PostPlusSubscriptionEventResult> {
	// the user's plan before the event, and nothing for every other query
	const reportErrorSpy = configureWebhook()
	stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith('select "plan" from "users"') ? [[planBeforeEvent]] : [],
	)

	// the key's budget check, the key reissue, and a reissue backoff that waits no time
	const isUserLiteLLMKeyBudgetStaleSpy = spyOn(litellm, "isUserLiteLLMKeyBudgetStale").mockResolvedValue(
		isKeyBudgetStale,
	)
	const replaceUserLiteLLMKeySpy = spyOn(litellm, "replaceUserLiteLLMKey").mockResolvedValue(isKeyReissued)
	spyOn(globalThis, "setTimeout").mockImplementation(toEveryTimerInstantSetTimeout())

	// the signed event, and the response with the spies
	const response = await postSignedPlusSubscriptionUpdate()
	return { response, reportErrorSpy, isUserLiteLLMKeyBudgetStaleSpy, replaceUserLiteLLMKeySpy }
}

// a renewal on the same plan with a matching key keeps the LiteLLM key, so the key's spend keeps counting the whole month
test("a subscription event on the user's current plan with a matching key keeps the LiteLLM key", async () => {
	const { response, isUserLiteLLMKeyBudgetStaleSpy, replaceUserLiteLLMKeySpy } = await postPlusSubscriptionEvent({
		planBeforeEvent: "plus",
	})
	expect(response.status).toBe(200)
	expect(isUserLiteLLMKeyBudgetStaleSpy).toHaveBeenCalledWith("user-1")
	expect(replaceUserLiteLLMKeySpy).not.toHaveBeenCalled()
})

// a key left at an old budget by an earlier failed reissue is reissued on the next event, even on the same plan
test("a subscription event on the user's current plan with a stale key reissues the LiteLLM key", async () => {
	const { response, replaceUserLiteLLMKeySpy } = await postPlusSubscriptionEvent({
		planBeforeEvent: "plus",
		isKeyBudgetStale: true,
	})
	expect(response.status).toBe(200)
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")
})

// a plan change reissues the LiteLLM key at the new plan's budget without reading the key's budget
test("a subscription event that changes the plan reissues the LiteLLM key", async () => {
	const { response, isUserLiteLLMKeyBudgetStaleSpy, replaceUserLiteLLMKeySpy } = await postPlusSubscriptionEvent({
		planBeforeEvent: "free",
	})
	expect(response.status).toBe(200)
	expect(isUserLiteLLMKeyBudgetStaleSpy).not.toHaveBeenCalled()
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledWith("user-1")
})

// a reissue that fails every attempt is reported, and the webhook responds 500 so Stripe sends the event again
test("a subscription event whose key reissue fails every attempt responds 500 and is reported", async () => {
	const { response, reportErrorSpy, replaceUserLiteLLMKeySpy } = await postPlusSubscriptionEvent({
		planBeforeEvent: "free",
		isKeyReissued: false,
	})

	// every attempt ran, and the failure was reported with the user, then as a failed webhook
	expect(response.status).toBe(500)
	expect(replaceUserLiteLLMKeySpy).toHaveBeenCalledTimes(3)
	expect(reportErrorSpy.mock.calls.map((reportErrorCall) => reportErrorCall[2])).toEqual([
		{ userId: "user-1" },
		{ outcome: "failed" },
	])
})

// another user's billing state is a private read, so a non-admin reads it as missing
test("a non-admin asking for another user's billing state gets a 404", async () => {
	stubConnectionPool(() => [FREE_USER_ACCESS_ROW])
	const response = await toSignedInApp(billingRoute, "user-1").request("/billing/state?userId=user-2")
	expect(response.status).toBe(404)
	expect(await response.json()).toEqual({ error: "not found" })
})

// an active paid subscription holds the plan, status, customer, period end, and card-on-file flag
test("toPaidSubscription maps an active paid subscription", () => {
	const paidSubscription = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: "cus_1",
		metadata: { userId: "u1", plan: "plus", interval: "monthly" },
		current_period_end: 1_800_000_000,
		default_payment_method: "pm_1",
	})
	expect(paidSubscription).toEqual({
		plan: "plus",
		status: "active",
		stripeCustomerId: "cus_1",
		stripeSubscriptionId: "sub_1",
		currentPeriodEnd: new Date(1_800_000_000 * 1000),
		hasPaymentMethod: true,
		billingInterval: "monthly",
	})
})

// the billing interval is saved at checkout, and it decides
test("toPaidSubscription records a yearly subscription's billing interval", () => {
	const yearlySubscription = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: "cus_1",
		metadata: { userId: "u1", plan: "plus", interval: "yearly" },
		default_payment_method: "pm_1",
	})
	expect(yearlySubscription?.billingInterval).toBe("yearly")
	expect(yearlySubscription?.hasPaymentMethod).toBe(true)
})

// a canceled subscription clears the row, reverting the user to free
test("toPaidSubscription clears on cancellation", () => {
	const canceledSubscription = toPaidSubscription({
		id: "sub_1",
		status: "canceled",
		customer: "cus_1",
		metadata: { plan: "plus" },
	})
	expect(canceledSubscription).toBeNull()
})

// an unpaid status must never return a paid subscription, or an abandoned checkout would hand out a paid plan for free
test("toPaidSubscription clears on every status that is not paid up", () => {
	// each of these reaches the webhook before or after money has actually changed hands
	for (const status of ["incomplete", "incomplete_expired", "unpaid", "paused"]) {
		const unpaidSubscription = toPaidSubscription({
			id: "sub_1",
			status,
			customer: "cus_1",
			metadata: { plan: "plus" },
		})
		expect(unpaidSubscription).toBeNull()
	}
})

// a trial and the dunning window for late payments both still earn the plan
test("toPaidSubscription projects a trialing or past_due subscription", () => {
	for (const status of ["trialing", "past_due"]) {
		const lateOrTrialSubscription = toPaidSubscription({
			id: "sub_1",
			status,
			customer: "cus_1",
			metadata: { plan: "plus" },
		})
		expect(lateOrTrialSubscription?.plan).toBe("plus")
		expect(lateOrTrialSubscription?.status).toBe(status)
	}
})

// the price is what a plan change in the Customer Portal rewrites, and our metadata is not, so the price wins.
test("toPaidSubscription reads the billing interval off the price, not the saved metadata", () => {
	const switchedToYearly = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: "cus_1",
		metadata: { userId: "u1", plan: "plus", interval: "monthly" },
		items: { data: [{ price: { recurring: { interval: "year" } } }] },
	})
	expect(switchedToYearly?.billingInterval).toBe("yearly")

	// a subscriber who moved from yearly back to monthly can be billed overage again
	const switchedToMonthly = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: "cus_1",
		metadata: { userId: "u1", plan: "plus", interval: "yearly" },
		items: { data: [{ price: { recurring: { interval: "month" } } }] },
	})
	expect(switchedToMonthly?.billingInterval).toBe("monthly")
})

// a monthly subscription includes its plan price and the metered overage price, both billed monthly
test("toPaidSubscription reads a monthly subscription including its overage price as monthly", () => {
	const monthlyWithOverage = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: "cus_1",
		metadata: { userId: "u1", plan: "plus" },
		items: { data: [{ price: { recurring: { interval: "month" } } }, { price: { recurring: { interval: "month" } } }] },
	})
	expect(monthlyWithOverage?.billingInterval).toBe("monthly")
})

// every subscription created before the billing interval column existed is monthly
test("toPaidSubscription reads a subscription with no saved billing interval as monthly", () => {
	const legacySubscription = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: "cus_1",
		metadata: { userId: "u1", plan: "plus" },
	})
	expect(legacySubscription?.billingInterval).toBe("monthly")
})

// a subscription with no plan metadata is not one of ours, so it clears the row
test("toPaidSubscription clears when the plan metadata is missing", () => {
	const invalidSubscription = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: "cus_1",
		metadata: { userId: "u1" },
	})
	expect(invalidSubscription).toBeNull()
})

// a subscription without a stored card keeps the manual-scan limit hard
test("projectSubscription reports no card and reads the customer id from an object", () => {
	const singlePaymentSubscription = toPaidSubscription({
		id: "sub_1",
		status: "active",
		customer: { id: "cus_2" },
		metadata: { plan: "premium" },
	})
	expect(singlePaymentSubscription?.hasPaymentMethod).toBe(false)
	expect(singlePaymentSubscription?.stripeCustomerId).toBe("cus_2")
})
