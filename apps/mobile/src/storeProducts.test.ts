// store product tests: the package for a plan and interval on both stores, the card's price for each interval, and
// the product a subscriber holds
import { expect, test } from "bun:test"
import { findStorePackage, type StorePackage, toActiveStoreProductId, toStorePlanPrice } from "./storeProducts"

// a package as the store returns it, at a price
function toStorePackage(identifier: string, priceString: string, pricePerMonthString: string | null): StorePackage {
	return { product: { identifier, priceString, pricePerMonthString } }
}

// Google's offering, with euro prices
const PLAY_STORE_PACKAGES = [
	toStorePackage("carlnotes_plus:monthly", "€21.99", "€21.99"),
	toStorePackage("carlnotes_plus:yearly", "€219.99", "€18.33"),
	toStorePackage("carlnotes_premium:monthly", "€43.99", "€43.99"),
]

// each store's ids name the plan and the interval, and a missing package is undefined
test("findStorePackage finds the package for a plan and interval", () => {
	expect(findStorePackage(PLAY_STORE_PACKAGES, "plus", "yearly")).toBe(PLAY_STORE_PACKAGES[1])
	expect(findStorePackage(PLAY_STORE_PACKAGES, "premium", "yearly")).toBeUndefined()
	expect(findStorePackage(PLAY_STORE_PACKAGES, "free", "monthly")).toBeUndefined()
	const appStorePackage = toStorePackage("carlnotes.premium.monthly", "$40.00", "$40.00")
	expect(findStorePackage([appStorePackage], "premium", "monthly")).toBe(appStorePackage)
})

// a monthly card shows the store's price, and a yearly card the per-month price with the whole price in its note
test("toStorePlanPrice shows the store's price per month", () => {
	expect(toStorePlanPrice(PLAY_STORE_PACKAGES[0] as StorePackage, "monthly")).toEqual({
		price: "€21.99",
		billingNote: "Billed monthly",
	})
	expect(toStorePlanPrice(PLAY_STORE_PACKAGES[1] as StorePackage, "yearly")).toEqual({
		price: "€18.33",
		billingNote: "Billed €219.99 yearly",
	})

	// a store with no per-month price shows the whole price
	expect(toStorePlanPrice(toStorePackage("carlnotes.plus.yearly", "$200.00", null), "yearly").price).toBe("$200.00")
})

// a subscriber mid-switch holds both entitlements, and the higher one names the product
test("toActiveStoreProductId reads the highest active entitlement's product", () => {
	expect(
		toActiveStoreProductId({
			plus: { productIdentifier: "carlnotes_plus" },
			premium: { productIdentifier: "carlnotes_premium" },
		}),
	).toBe("carlnotes_premium")
	expect(toActiveStoreProductId({})).toBeNull()
})
