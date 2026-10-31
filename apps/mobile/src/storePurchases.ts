// the app's store purchases through RevenueCat: the configuration at launch with an anonymous id, the user the store
// bills, what the store sells on the user's storefront, the purchase, the restore, and where a paid plan is managed
import { fetchBillingState, sendStoreCheckoutStarted, sendStoreSubscriptionSync } from "@carlnotes/client/billingClient"
import type { BillingInterval, PaidPlan } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { STORE_MANAGEMENT_URLS, type StoreProvider, toStoreSubscriptionId } from "@carlnotes/contracts/storeBilling"
import type { PlanPrice } from "@carlnotes/core/components/PlanCard"
import { isFullStoreOffering, type StoreOffering } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { readStoreOffering, setStoreOffering } from "@carlnotes/core/stores/purchaseOffersStore"
import { Linking } from "react-native"
import Purchases, { type PurchasesError, type PurchasesPackage } from "react-native-purchases"
import { MOBILE_PLATFORM } from "./deviceTelemetry"
import { findStorePackage, toActiveStoreProductId, toStorePlanPrice } from "./storeProducts"

// the store this build sells through, and its public RevenueCat key. a build without the key stays read-only
export const STORE_PROVIDER: StoreProvider = MOBILE_PLATFORM === "ios" ? "app_store" : "play_store"
const REVENUECAT_API_KEY =
	MOBILE_PLATFORM === "ios"
		? process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY
		: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY

// whether RevenueCat is configured, and the current offering's packages
let isRevenueCatConfigured = false
let storePackages: PurchasesPackage[] = []

// the store user changes, purchases, and restores in the order they started, so a user change never runs inside a
// purchase or a restore
let storeOperationQueue: Promise<unknown> = Promise.resolve()

/**
 * Configures RevenueCat once at launch with an anonymous id, and loads the offering.
 */
export function configureStorePurchases(): void {
	if (isRevenueCatConfigured || !REVENUECAT_API_KEY) {
		return
	}
	Purchases.configure({ apiKey: REVENUECAT_API_KEY })
	isRevenueCatConfigured = true
	void loadStoreOffering().catch((error) => console.error("store offering load failed", error))
}

/**
 * Returns whether RevenueCat is configured with this build's key.
 */
export function isStorePurchasesConfigured(): boolean {
	return isRevenueCatConfigured
}

// the error for a store sync that failed after the store charged
export class StoreSyncError extends Error {}

/**
 * Logs the store out to an anonymous id once no one is signed in. A purchase or a restore logs the store in as the
 * signed-in user first. The change waits for a purchase or a restore in progress.
 */
export function logOutStoreUser(): Promise<void> {
	return queueStoreOperation(async () => {
		// an anonymous store user has nothing to log out of
		if (isRevenueCatConfigured && !(await Purchases.isAnonymous())) {
			await Purchases.logOut()
		}
	})
}

/**
 * Reads what the store sells on the user's storefront and records it for the purchase offers. A build without the
 * key records nothing, and a failed read records the store as read-only and throws an error.
 */
export async function loadStoreOffering(): Promise<StoreOffering | null> {
	if (!isRevenueCatConfigured) {
		return null
	}
	try {
		// the offering's packages, and the storefront the store account buys from
		const [offerings, storefront] = await Promise.all([Purchases.getOfferings(), Purchases.getStorefront()])
		storePackages = offerings.current?.availablePackages ?? []
		const storeOffering: StoreOffering = {
			storeProvider: STORE_PROVIDER,
			storefrontCountryCode: storefront?.countryCode ?? null,
			hasFullOffering: isFullStoreOffering(storePackages.map((storePackage) => storePackage.product.identifier)),
		}
		setStoreOffering(storeOffering)
		return storeOffering
	} catch (error) {
		// a store that failed to load sells nothing until the next load
		storePackages = []
		setStoreOffering(null)
		throw error
	}
}

/**
 * Returns the store's price for a plan at a billing interval, or undefined if the offering lacks it.
 */
export function toStorePrice(plan: PaidPlan, billingInterval: BillingInterval): PlanPrice | undefined {
	const storePackage = findStorePackage(storePackages, plan, billingInterval)
	return storePackage && toStorePlanPrice(storePackage, billingInterval)
}

// the plan the signed-in user buys, and its billing interval
type PurchaseStorePlanOptions = { plan: PaidPlan; billingInterval: BillingInterval }

/**
 * Buys a plan for the signed-in user, or switches a store subscriber to it, then syncs the subscription through the
 * api. Returns the billing state the sync left, or null if the user canceled the store's sheet. A sync that fails
 * after the store charged throws a StoreSyncError.
 */
export function purchaseStorePlan(purchaseStorePlanOptions: PurchaseStorePlanOptions): Promise<BillingState | null> {
	return queueStoreOperation(() => buyStorePlan(purchaseStorePlanOptions))
}

/**
 * Restores the store account's purchases to the signed-in user, then syncs the subscription through the api. Returns
 * the billing state the sync left, and whether the store held a plan to restore.
 */
export function restoreStorePurchases(): Promise<{ billing: BillingState; isRestored: boolean }> {
	return queueStoreOperation(async () => {
		// log the store in as the user, restore, and sync with the storefront
		await logInStoreUser()
		const customerInfo = await Purchases.restorePurchases()
		const billing = await sendStoreSubscriptionSync(readStoreOffering()?.storefrontCountryCode ?? null)
		return { billing, isRestored: toActiveStoreProductId(customerInfo.entitlements.active) !== null }
	})
}

/**
 * Opens where a store plan is managed: the subscription's own page in this build's store, or the other store's
 * subscription page. The app links nowhere for a plan billed on the web.
 */
export async function openPlanManagement(storeProvider: StoreProvider): Promise<void> {
	// this build's store names the subscription's own page if the customer read succeeds, and the store's general page
	// works anywhere
	const managementUrl =
		storeProvider === STORE_PROVIDER && isRevenueCatConfigured
			? await Purchases.getCustomerInfo().then(
					(customerInfo) => customerInfo.managementURL,
					() => null,
				)
			: null
	await Linking.openURL(managementUrl ?? STORE_MANAGEMENT_URLS[storeProvider])
}

// run a store operation after the ones before it settle
function queueStoreOperation<Result>(storeOperation: () => Promise<Result>): Promise<Result> {
	const queuedStoreOperation = storeOperationQueue.then(storeOperation)
	storeOperationQueue = queuedStoreOperation.catch(() => undefined)
	return queuedStoreOperation
}

// buy the plan's package as the user, and sync what the store bought
async function buyStorePlan({ plan, billingInterval }: PurchaseStorePlanOptions): Promise<BillingState | null> {
	// find the plan's package, log the store in as the user, and record the checkout start with the storefront
	const storePackage = findStorePackage(storePackages, plan, billingInterval)
	if (!storePackage) {
		throw new Error(`the store offering has no ${plan} ${billingInterval} package`)
	}
	const storefrontCountryCode = readStoreOffering()?.storefrontCountryCode ?? null
	await logInStoreUser()
	void sendStoreCheckoutStarted({ plan, billingInterval, storefrontCountryCode })

	// Google replaces the product a subscriber holds, and Apple switches within the subscription group on its own
	const activeProductId =
		MOBILE_PLATFORM === "android"
			? toActiveStoreProductId((await Purchases.getCustomerInfo()).entitlements.active)
			: null
	const productChangeInfo = activeProductId ? { oldProductIdentifier: toStoreSubscriptionId(activeProductId) } : null

	// open the store's sheet
	try {
		await Purchases.purchasePackage(storePackage, null, productChangeInfo)
	} catch (error) {
		// a canceled sheet buys nothing and needs no sync
		if ((error as PurchasesError).userCancelled) {
			return null
		}
		throw error
	}

	// sync what the store bought. a sync that fails now fails after the charge
	return await sendStoreSubscriptionSync(storefrontCountryCode).catch((error: unknown) => {
		throw new StoreSyncError(error instanceof Error ? error.message : String(error))
	})
}

// log the store in as the signed-in user's RevenueCat app user id, which only the api knows
async function logInStoreUser(): Promise<void> {
	const { revenueCatAppUserId } = await fetchBillingState()
	if (!revenueCatAppUserId) {
		throw new Error("the billing state names no RevenueCat app user id")
	}
	if ((await Purchases.getAppUserID()) !== revenueCatAppUserId) {
		await Purchases.logIn(revenueCatAppUserId)
	}
}
