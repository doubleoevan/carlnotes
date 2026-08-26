// billing tests for the subscription projection that the webhook applies to billing_subscriptions
import { expect, test } from "bun:test"
import { toPaidSubscription } from "./billing"

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

// the billing interval is stamped at checkout, and it decides
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
test("toPaidSubscription reads the billing interval off the price, not the stamped metadata", () => {
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
test("toPaidSubscription reads a subscription with no stamped billing interval as monthly", () => {
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
