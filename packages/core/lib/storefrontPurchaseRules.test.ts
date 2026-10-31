// storefront purchase rules tests: the app's store offering on each platform, a partial and a missing offering, a null
// storefront, a Stripe and a store subscriber, the web, and the full offering check over both stores' product ids
import { expect, test } from "bun:test"
import { isFullStoreOffering, type StoreOffering, toPurchaseOffers } from "./storefrontPurchaseRules"

// a full offering on each store, in the United States
const APP_STORE_OFFERING: StoreOffering = {
	storeProvider: "app_store",
	storefrontCountryCode: "USA",
	hasFullOffering: true,
}
const PLAY_STORE_OFFERING: StoreOffering = {
	storeProvider: "play_store",
	storefrontCountryCode: "US",
	hasFullOffering: true,
}

// a free user buys through either store if its offering holds every plan
test("a full offering sells to a free user on each platform", () => {
	for (const storeOffering of [APP_STORE_OFFERING, PLAY_STORE_OFFERING]) {
		expect(toPurchaseOffers({ platform: "mobile", storeOffering, plan: "free", provider: null })).toEqual({
			canPurchase: true,
			planManagement: null,
		})
	}
})

// a partial offering and an offering that has not loaded are read-only
test("a partial or missing offering is read-only", () => {
	const partialOffering = { ...APP_STORE_OFFERING, hasFullOffering: false }
	expect(
		toPurchaseOffers({ platform: "mobile", storeOffering: partialOffering, plan: "free", provider: null }),
	).toEqual({
		canPurchase: false,
		planManagement: null,
	})
	expect(toPurchaseOffers({ platform: "mobile", storeOffering: null, plan: "free", provider: null }).canPurchase).toBe(
		false,
	)
})

// the offering decides what may be bought, so a storefront the store did not name still sells
test("a null storefront with a full offering sells", () => {
	const storeOffering = { ...PLAY_STORE_OFFERING, storefrontCountryCode: null }
	expect(toPurchaseOffers({ platform: "mobile", storeOffering, plan: "free", provider: null }).canPurchase).toBe(true)
})

// a Stripe subscriber is never offered the store, and manages the plan on the web
test("a Stripe subscriber is read-only in the app and manages the plan on the web", () => {
	expect(
		toPurchaseOffers({ platform: "mobile", storeOffering: APP_STORE_OFFERING, plan: "plus", provider: "stripe" }),
	).toEqual({ canPurchase: false, planManagement: "web" })
})

// a store subscriber switches plans in the same store, and is read-only in the other store
test("a store subscriber switches plans in the same store only", () => {
	expect(
		toPurchaseOffers({ platform: "mobile", storeOffering: APP_STORE_OFFERING, plan: "plus", provider: "app_store" }),
	).toEqual({ canPurchase: true, planManagement: "app_store" })
	expect(
		toPurchaseOffers({ platform: "mobile", storeOffering: PLAY_STORE_OFFERING, plan: "plus", provider: "app_store" }),
	).toEqual({ canPurchase: false, planManagement: "app_store" })
})

// the web sells through checkout and the portal, except to a store subscriber, whose store manages the plan
test("the web sells to everyone but a store subscriber", () => {
	expect(toPurchaseOffers({ platform: "web", storeOffering: null, plan: "free", provider: null })).toEqual({
		canPurchase: true,
		planManagement: null,
	})
	expect(toPurchaseOffers({ platform: "web", storeOffering: null, plan: "premium", provider: "stripe" })).toEqual({
		canPurchase: true,
		planManagement: "portal",
	})
	expect(toPurchaseOffers({ platform: "web", storeOffering: null, plan: "plus", provider: "play_store" })).toEqual({
		canPurchase: false,
		planManagement: "play_store",
	})
})

// a visitor buys after sign-up on either platform
test("a visitor is offered no purchase", () => {
	expect(
		toPurchaseOffers({ platform: "mobile", storeOffering: APP_STORE_OFFERING, plan: null, provider: null }),
	).toEqual({
		canPurchase: false,
		planManagement: null,
	})
})

// both stores' id formats count, and a missing plan or interval makes the offering partial
test("isFullStoreOffering needs every paid plan at both intervals", () => {
	const appStoreProductIds = [
		"carlnotes.plus.monthly",
		"carlnotes.plus.yearly",
		"carlnotes.premium.monthly",
		"carlnotes.premium.yearly",
	]
	expect(isFullStoreOffering(appStoreProductIds)).toBe(true)
	expect(
		isFullStoreOffering([
			"carlnotes_plus:monthly",
			"carlnotes_plus:yearly",
			"carlnotes_premium:monthly",
			"carlnotes_premium:yearly",
		]),
	).toBe(true)
	expect(isFullStoreOffering(appStoreProductIds.slice(1))).toBe(false)
	expect(isFullStoreOffering([])).toBe(false)
})
