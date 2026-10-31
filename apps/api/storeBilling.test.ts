// store billing projection tests: a RevenueCat customer through purchase, renewal, cancellation, billing issue, grace
// period, expiry, refund, and plan change, RevenueCat's store names, and which sandbox purchases count
import { afterEach, expect, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { isSandboxPurchaseAllowed, toStoreProvider, toStoreSubscription, withoutSandboxPurchases } from "./storeBilling"
import { LAST_MONTH, NEXT_MONTH, NOW_MS, PLUS_MONTHLY, toRevenueCatCustomer } from "./storeBillingTestFixtures"

// the environment and the sandbox user ids, put back after each test
const restoreEnvSettings = saveEnvSettings(["DOPPLER_ENVIRONMENT", "REVENUECAT_SANDBOX_USER_IDS"])
afterEach(() => {
	restoreEnvSettings()
})

// a purchase projects the plan, the interval, the period end, and RevenueCat's and the store's ids
test("toStoreSubscription projects an active purchase", () => {
	expect(toStoreSubscription(toRevenueCatCustomer(PLUS_MONTHLY), NOW_MS)).toEqual({
		provider: "app_store",
		plan: "plus",
		status: "active",
		providerCustomerId: "revenuecat-user-1",
		providerSubscriptionId: "transaction-carlnotes.plus.monthly",
		currentPeriodEnd: new Date(NEXT_MONTH),
		hasPaymentMethod: true,
		billingInterval: "monthly",
	})
})

// Google keys a subscription by its id and names the base plan apart, and the base plan names the interval
test("toStoreSubscription reads a Google base plan's interval", () => {
	const googlePremiumYearly = toRevenueCatCustomer({
		entitlementId: "premium",
		productId: "carlnotes_premium",
		store: "play_store",
		productPlanId: "yearly",
	})
	const storeSubscription = toStoreSubscription(googlePremiumYearly, NOW_MS)
	expect(storeSubscription?.provider).toBe("play_store")
	expect(storeSubscription?.plan).toBe("premium")
	expect(storeSubscription?.billingInterval).toBe("yearly")
})

// a cancellation keeps the plan until the period ends, and a billing issue keeps it through the grace period
test("toStoreSubscription keeps the plan through a cancellation and a billing issue", () => {
	const canceledCustomer = toRevenueCatCustomer({ ...PLUS_MONTHLY, unsubscribeDetectedAt: LAST_MONTH })
	expect(toStoreSubscription(canceledCustomer, NOW_MS)?.status).toBe("canceled")

	// the entitlement expired, but the grace period has not, so the period ends with the grace period
	const gracePeriodCustomer = toRevenueCatCustomer({
		...PLUS_MONTHLY,
		expiresDate: LAST_MONTH,
		gracePeriodExpiresDate: NEXT_MONTH,
		billingIssuesDetectedAt: LAST_MONTH,
	})
	expect(toStoreSubscription(gracePeriodCustomer, NOW_MS)).toMatchObject({
		plan: "plus",
		status: "past_due",
		currentPeriodEnd: new Date(NEXT_MONTH),
	})
})

// a renewal after a grace period leaves the old grace period end behind, and the later expiry ends the period
test("toStoreSubscription ends the period at the later of the expiry and the grace period end", () => {
	const renewedAfterGracePeriod = toRevenueCatCustomer({ ...PLUS_MONTHLY, gracePeriodExpiresDate: LAST_MONTH })
	expect(toStoreSubscription(renewedAfterGracePeriod, NOW_MS)?.currentPeriodEnd).toEqual(new Date(NEXT_MONTH))
})

// an expiry and a refund both end the entitlement, which clears the row
test("toStoreSubscription clears an expired or refunded subscription", () => {
	expect(toStoreSubscription(toRevenueCatCustomer({ ...PLUS_MONTHLY, expiresDate: LAST_MONTH }), NOW_MS)).toBeNull()
	expect(toStoreSubscription(toRevenueCatCustomer(), NOW_MS)).toBeNull()
})

// a plan change leaves both entitlements active for a moment, and the higher plan is the one the user holds
test("toStoreSubscription projects the higher plan during a plan change", () => {
	const planChangeCustomer = toRevenueCatCustomer(PLUS_MONTHLY, {
		entitlementId: "premium",
		productId: "carlnotes.premium.yearly",
	})
	expect(toStoreSubscription(planChangeCustomer, NOW_MS)).toMatchObject({ plan: "premium", billingInterval: "yearly" })
})

// a promotional grant or an entitlement that is not a plan is not a store subscription
test("toStoreSubscription ignores a store the app does not sell through and an unknown entitlement", () => {
	expect(toStoreSubscription(toRevenueCatCustomer({ ...PLUS_MONTHLY, store: "promotional" }), NOW_MS)).toBeNull()
	expect(
		toStoreSubscription(toRevenueCatCustomer({ entitlementId: "pro", productId: "pro.monthly" }), NOW_MS),
	).toBeNull()
})

// RevenueCat's lowercase store names map to the two providers
test("toStoreProvider maps RevenueCat's store names", () => {
	expect(toStoreProvider("app_store")).toBe("app_store")
	expect(toStoreProvider("mac_app_store")).toBe("app_store")
	expect(toStoreProvider("play_store")).toBe("play_store")
	expect(toStoreProvider("stripe")).toBeNull()
})

// a sandbox premium drops out, so the paid plus is the plan the customer holds
test("withoutSandboxPurchases drops the entitlements a sandbox purchase grants", () => {
	const sandboxPremium = { entitlementId: "premium", productId: "carlnotes.premium.monthly", isSandbox: true }
	const customer = withoutSandboxPurchases(toRevenueCatCustomer(PLUS_MONTHLY, sandboxPremium))
	expect(Object.keys(customer.subscriber.entitlements)).toEqual(["plus"])
	expect(toStoreSubscription(customer, NOW_MS)?.plan).toBe("plus")
	expect(toStoreSubscription(withoutSandboxPurchases(toRevenueCatCustomer(sandboxPremium)), NOW_MS)).toBeNull()
})

// dev counts every sandbox purchase, and every other environment only the listed users'
test("isSandboxPurchaseAllowed allows dev and the listed users", () => {
	Bun.env.DOPPLER_ENVIRONMENT = "dev"
	delete Bun.env.REVENUECAT_SANDBOX_USER_IDS
	expect(isSandboxPurchaseAllowed("user-1")).toBe(true)

	// production allows only the listed users
	Bun.env.DOPPLER_ENVIRONMENT = "prd"
	Bun.env.REVENUECAT_SANDBOX_USER_IDS = "app-review, user-2"
	expect(isSandboxPurchaseAllowed("app-review")).toBe(true)
	expect(isSandboxPurchaseAllowed("user-2")).toBe(true)
	expect(isSandboxPurchaseAllowed("user-1")).toBe(false)
})
