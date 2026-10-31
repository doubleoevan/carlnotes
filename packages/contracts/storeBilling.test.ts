// store billing tests: the highest plan among the entitlements, the interval, plan, and subscription id each store's
// product id names, and which providers are a store
import { expect, test } from "bun:test"
import {
	isStoreProvider,
	toHighestStorePlan,
	toStoreBillingInterval,
	toStoreProduct,
	toStoreSubscriptionId,
} from "./storeBilling"

// Google keys a subscription by its id without the base plan, and Apple's product id is the subscription id
test("toStoreSubscriptionId drops Google's base plan", () => {
	expect(toStoreSubscriptionId("carlnotes_plus:monthly")).toBe("carlnotes_plus")
	expect(toStoreSubscriptionId("carlnotes.plus.monthly")).toBe("carlnotes.plus.monthly")
})

// a user holding both entitlements during a plan switch reads the higher plan
test("toHighestStorePlan returns the highest-ranked plan", () => {
	expect(toHighestStorePlan(["plus", "premium"])).toBe("premium")
	expect(toHighestStorePlan(["pro", "plus"])).toBe("plus")
	expect(toHighestStorePlan([])).toBeNull()
})

// Apple's dotted ids and Google's subscription and base plan ids both name the interval in the id
test("toStoreBillingInterval reads the interval from either store's product id", () => {
	expect(toStoreBillingInterval("carlnotes.plus.monthly")).toBe("monthly")
	expect(toStoreBillingInterval("carlnotes.premium.yearly")).toBe("yearly")
	expect(toStoreBillingInterval("carlnotes_plus:monthly")).toBe("monthly")
	expect(toStoreBillingInterval("carlnotes_premium:yearly")).toBe("yearly")

	// an id with no interval word reads as monthly
	expect(toStoreBillingInterval("carlnotes_plus")).toBe("monthly")
})

// a product names its plan and its interval, and a product that is not ours names nothing
test("toStoreProduct reads the plan and interval from either store's product id", () => {
	expect(toStoreProduct("carlnotes.premium.yearly")).toEqual({ plan: "premium", billingInterval: "yearly" })
	expect(toStoreProduct("carlnotes_plus:monthly")).toEqual({ plan: "plus", billingInterval: "monthly" })
	expect(toStoreProduct("carlnotes.coffee")).toBeNull()
})

// the App Store and Google Play are stores, and Stripe and no provider are not
test("isStoreProvider names the two stores", () => {
	expect(isStoreProvider("app_store")).toBe(true)
	expect(isStoreProvider("play_store")).toBe(true)
	expect(isStoreProvider("stripe")).toBe(false)
	expect(isStoreProvider(null)).toBe(false)
})
