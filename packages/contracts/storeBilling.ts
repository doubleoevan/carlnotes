// the store subscriptions the app sells: RevenueCat's entitlement ids, the highest plan among them, the plan, billing
// interval, and subscription id a store product id names, and where each store manages a subscription
import type { BillingInterval, BillingProvider, PaidPlan } from "./plans"

// the providers that are a store
export type StoreProvider = Exclude<BillingProvider, "stripe">

// the entitlement ids, which are the paid plans, highest plan first
export const STORE_ENTITLEMENT_IDS: readonly PaidPlan[] = ["premium", "plus"]

// where a subscriber manages a store subscription: the store's own subscription page
export const STORE_MANAGEMENT_URLS: Record<StoreProvider, string> = {
	app_store: "https://apps.apple.com/account/subscriptions",
	play_store: "https://play.google.com/store/account/subscriptions",
}

// each store's name as a sentence says it
export const STORE_NAMES: Record<StoreProvider, string> = {
	app_store: "the App Store",
	play_store: "Google Play",
}

// a store product's plan and billing interval
export type StoreProduct = { plan: PaidPlan; billingInterval: BillingInterval }

/**
 * Whether a billing provider is a store.
 */
export function isStoreProvider(provider: string | null | undefined): provider is StoreProvider {
	return provider === "app_store" || provider === "play_store"
}

/**
 * Returns the highest-ranked plan among the entitlement ids, or null if none is ours.
 */
export function toHighestStorePlan(entitlementIds: readonly string[]): PaidPlan | null {
	return STORE_ENTITLEMENT_IDS.find((storeEntitlementId) => entitlementIds.includes(storeEntitlementId)) ?? null
}

/**
 * Returns the subscription id a store product id belongs to: Google's id without its base plan, and Apple's id whole.
 */
export function toStoreSubscriptionId(productId: string): string {
	return productId.split(":")[0] ?? productId
}

/**
 * Returns the billing interval a store product id names: yearly if the id holds the word, monthly otherwise. Apple's
 * ids read `carlnotes.plus.yearly` and Google's `carlnotes_plus:yearly`, so the word is the one thing both share.
 */
export function toStoreBillingInterval(productId: string): BillingInterval {
	return /yearly/i.test(productId) ? "yearly" : "monthly"
}

/**
 * Returns the plan and billing interval a store product id names, or null for a product that is not one of ours.
 */
export function toStoreProduct(productId: string): StoreProduct | null {
	const plan = STORE_ENTITLEMENT_IDS.find((storeEntitlementId) => productId.includes(storeEntitlementId))
	return plan ? { plan, billingInterval: toStoreBillingInterval(productId) } : null
}
