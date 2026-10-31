// the storefront purchase rules: whether a user may buy a plan and where their paid plan is managed, from the platform,
// what the app's store sells on the user's storefront, and the user's plan and billing provider
import { billingIntervals, isPaidPlan } from "@carlnotes/contracts/enums"
import { type BillingProvider, type Plan, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import {
	isStoreProvider,
	STORE_ENTITLEMENT_IDS,
	type StoreProvider,
	toStoreProduct,
} from "@carlnotes/contracts/storeBilling"

// what the app's store sells: the store, the storefront country code it reports or null, and whether its offering
// holds every paid plan at both intervals
export type StoreOffering = {
	storeProvider: StoreProvider
	storefrontCountryCode: string | null
	hasFullOffering: boolean
}

// where a paid plan is managed: Stripe's portal, a store's subscription page, or the web from the app
export type PlanManagement = "portal" | StoreProvider | "web"

// whether the user may buy a plan, and where their paid plan is managed, or null for a free plan and a visitor
export type PurchaseOffers = { canPurchase: boolean; planManagement: PlanManagement | null }

// the platform, the app's store offering or null before the store's offering loads and on the web, and the user's
// plan and billing provider, with a null plan for a visitor
export type PurchaseOffersOptions = {
	platform: "web" | "mobile"
	storeOffering: StoreOffering | null
	plan: Plan | null
	provider: BillingProvider | null
}

// the label of each place a paid plan is managed, and the line the app shows with no link for a plan billed on the web
export const PLAN_MANAGEMENT_LABELS: Record<PlanManagement, string> = {
	portal: PURCHASE_COPY.manageBilling,
	app_store: PURCHASE_COPY.manageInAppStore,
	play_store: PURCHASE_COPY.manageInGooglePlay,
	web: "Your plan is billed on the web.",
}

/**
 * Returns the purchase offers. The web's checkout sells to every user but a store subscriber. The app sells through
 * its store on every storefront whose offering holds every plan, to a user with no subscription or one from the same
 * store, and is read-only before the store's offering loads or with a partial offering.
 */
export function toPurchaseOffers({ platform, storeOffering, plan, provider }: PurchaseOffersOptions): PurchaseOffers {
	// a visitor buys after sign-up, and only a paid plan is managed somewhere
	if (!plan) {
		return { canPurchase: false, planManagement: null }
	}
	const planManagement = isPaidPlan(plan) ? toPlanManagement(platform, provider) : null

	// the web sells to everyone but a store subscriber, and the app to a user its store could bill
	if (platform === "web") {
		return { canPurchase: !isStoreProvider(provider), planManagement }
	}
	const canStoreBill = provider === null || provider === storeOffering?.storeProvider
	return { canPurchase: Boolean(storeOffering?.hasFullOffering) && canStoreBill, planManagement }
}

/**
 * Whether a store's product ids hold every paid plan at both intervals.
 */
export function isFullStoreOffering(productIds: readonly string[]): boolean {
	const storeProducts = productIds.flatMap((productId) => toStoreProduct(productId) ?? [])
	return STORE_ENTITLEMENT_IDS.every((plan) =>
		billingIntervals.every((billingInterval) =>
			storeProducts.some(
				(storeProduct) => storeProduct.plan === plan && storeProduct.billingInterval === billingInterval,
			),
		),
	)
}

/**
 * Returns where a paid plan is managed: a store subscriber's store, and Stripe's portal, which the app names as the web.
 */
export function toPlanManagement(platform: "web" | "mobile", provider: BillingProvider | null): PlanManagement {
	if (isStoreProvider(provider)) {
		return provider
	}
	return platform === "web" ? "portal" : "web"
}
