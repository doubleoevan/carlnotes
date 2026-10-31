// the store's packages as the plan cards read them: the package for a plan and interval, its price, and the store
// product a subscriber holds
import type { BillingInterval, Plan } from "@carlnotes/contracts/plans"
import { toHighestStorePlan, toStoreProduct } from "@carlnotes/contracts/storeBilling"
import type { PlanPrice } from "@carlnotes/core/components/PlanCard"

// the fields of a store package the app reads
export type StorePackage = {
	product: { identifier: string; priceString: string; pricePerMonthString: string | null }
}

/**
 * Returns the package that sells a plan at a billing interval, or undefined if the offering lacks it.
 */
export function findStorePackage<Package extends StorePackage>(
	storePackages: readonly Package[],
	plan: Plan,
	billingInterval: BillingInterval,
): Package | undefined {
	return storePackages.find((storePackage) => {
		const storeProduct = toStoreProduct(storePackage.product.identifier)
		return storeProduct?.plan === plan && storeProduct.billingInterval === billingInterval
	})
}

/**
 * Returns a package's price as a plan card shows it: per month, with a yearly product's whole price in the note.
 */
export function toStorePlanPrice(storePackage: StorePackage, billingInterval: BillingInterval): PlanPrice {
	const { priceString, pricePerMonthString } = storePackage.product
	if (billingInterval === "monthly") {
		return { price: priceString, billingNote: "Billed monthly" }
	}
	return { price: pricePerMonthString ?? priceString, billingNote: `Billed ${priceString} yearly` }
}

/**
 * Returns the store product behind the subscriber's highest active entitlement, or null without one.
 */
export function toActiveStoreProductId(
	activeEntitlements: Readonly<Record<string, { productIdentifier: string }>>,
): string | null {
	const plan = toHighestStorePlan(Object.keys(activeEntitlements))
	return plan ? (activeEntitlements[plan]?.productIdentifier ?? null) : null
}
