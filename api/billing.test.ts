// billing tests for the subscription projection that the webhook applies to billing_subscriptions, and for the
// webhook's responses: a 400 for a bad signature and a 500 for a verified event that could not be applied
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { restoreEnv } from "@shared/testEnv"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import { toPaidSubscription } from "./billing"
import { billingRoute } from "./billingRoute"

// the webhook's secret and the Stripe key, put back after each test with the pool and the spies
const originalWebhookSecret = Bun.env.STRIPE_WEBHOOK_SECRET
const originalStripeKey = Bun.env.STRIPE_SECRET_KEY
afterEach(() => {
	restoreEnv("STRIPE_WEBHOOK_SECRET", originalWebhookSecret)
	restoreEnv("STRIPE_SECRET_KEY", originalStripeKey)
	restoreConnectionPool()
	mock.restore()
})

// Stripe's signature header for a payload: the timestamp and the HMAC of "<timestamp>.<payload>" under the secret
async function toStripeSignature(payload: string, secret: string): Promise<string> {
	const timestamp = Math.floor(Date.now() / 1000)
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	)
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`))
	return `t=${timestamp},v1=${Buffer.from(signature).toString("hex")}`
}

// configure the webhook, silence the route's log, and return the spy on the report
function configureWebhook(): ReturnType<typeof spyOn<typeof monitoring, "reportError">> {
	Bun.env.STRIPE_SECRET_KEY = "sk_test_key"
	Bun.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
	spyOn(console, "error").mockImplementation(() => {})
	return spyOn(monitoring, "reportError").mockImplementation(() => {})
}

// post one webhook body, with a signature header if one is given
async function postWebhook(body: string, signature?: string): Promise<Response> {
	return await billingRoute.request("/webhooks/stripe", {
		method: "POST",
		headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) },
		body,
	})
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

// an unset webhook secret is this deploy's failure, so the event responds 500 and is reported as failed, not rejected
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
	const payload = JSON.stringify({
		id: "evt_1",
		object: "event",
		type: "customer.subscription.updated",
		data: {
			object: { id: "sub_1", status: "active", customer: "cus_1", metadata: { userId: "user-1", plan: "plus" } },
		},
	})
	const response = await postWebhook(payload, await toStripeSignature(payload, "whsec_test"))
	expect(response.status).toBe(500)
	expect(await response.json()).toEqual({ error: "webhook failed" })
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ outcome: "failed" })
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
