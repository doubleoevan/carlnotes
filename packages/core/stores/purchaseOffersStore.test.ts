import { afterEach, expect, test } from "bun:test"
import { readStoreOffering, setStoreOffering } from "./purchaseOffersStore"

// every test starts before the store's offering loads
afterEach(() => {
	setStoreOffering(null)
})

test("the offering starts unknown, and a recorded offering replaces it", () => {
	expect(readStoreOffering()).toBeNull()
	setStoreOffering({ storeProvider: "play_store", storefrontCountryCode: "DE", hasFullOffering: true })
	expect(readStoreOffering()).toEqual({
		storeProvider: "play_store",
		storefrontCountryCode: "DE",
		hasFullOffering: true,
	})
})

// an equal offering from a later load keeps the recorded one, so nothing re-renders
test("an unchanged offering keeps the recorded one", () => {
	setStoreOffering({ storeProvider: "app_store", storefrontCountryCode: "USA", hasFullOffering: true })
	const recordedOffering = readStoreOffering()
	setStoreOffering({ storeProvider: "app_store", storefrontCountryCode: "USA", hasFullOffering: true })
	expect(readStoreOffering()).toBe(recordedOffering)
})

test("a failed offering load clears the recorded offering", () => {
	setStoreOffering({ storeProvider: "app_store", storefrontCountryCode: "USA", hasFullOffering: true })
	setStoreOffering(null)
	expect(readStoreOffering()).toBeNull()
})
