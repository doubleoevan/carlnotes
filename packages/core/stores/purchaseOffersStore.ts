// what the app's store sells on the user's storefront, which the app sets, and the purchase offers that the app's
// purchase controls read
import { authClient } from "@carlnotes/client/authClient"
import { fetchBillingState } from "@carlnotes/client/billingClient"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { Plan } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { useQuery } from "@tanstack/react-query"
import { type PurchaseOffers, type StoreOffering, toPurchaseOffers } from "../lib/storefrontPurchaseRules"
import { toStoreListeners } from "./storeListeners"

// the store's offering, or null before the store's offering loads
let storeOffering: StoreOffering | null = null
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Records what the app's store sells, or null if its offering failed to load. An unchanged offering keeps the recorded
 * one and re-renders nothing.
 */
export function setStoreOffering(nextStoreOffering: StoreOffering | null): void {
	const isStoreOfferingUnchanged =
		storeOffering?.storeProvider === nextStoreOffering?.storeProvider &&
		storeOffering?.storefrontCountryCode === nextStoreOffering?.storefrontCountryCode &&
		storeOffering?.hasFullOffering === nextStoreOffering?.hasFullOffering
	if (isStoreOfferingUnchanged) {
		return
	}

	// record the new offering and re-render every component that reads the offering
	storeOffering = nextStoreOffering
	publish()
}

/**
 * Returns the query key of the signed-in user's billing state.
 */
export function toBillingQueryKey(userId: string | undefined): readonly ["billing", string | undefined] {
	return ["billing", userId]
}

/**
 * Returns the store's offering, or null before the store's offering loads.
 */
export function readStoreOffering(): StoreOffering | null {
	return storeOffering
}

/**
 * Returns the store's offering and re-renders the caller when it changes.
 */
export function useStoreOffering(): StoreOffering | null {
	useStoreVersion()
	return storeOffering
}

/**
 * Returns the signed-in user's purchase offers in the app, from the given billing state or else the cached one. A paid
 * plan stays read-only until its billing provider loads.
 */
export function usePurchaseOffers(accountBilling?: BillingState): PurchaseOffers {
	// a free user and a visitor have no billing row, so only a paid plan without Account's state reads one
	const currentStoreOffering = useStoreOffering()
	const { data: session } = authClient().useSession()
	const sessionPlan = session ? ((session.user.plan ?? "free") as Plan) : null
	const billingQuery = useQuery({
		queryKey: toBillingQueryKey(session?.user.id),
		enabled: !accountBilling && isPaidPlan(sessionPlan),
		queryFn: () => fetchBillingState(),
		staleTime: Number.POSITIVE_INFINITY,
	})

	// the given billing state's plan, null if this build does not know the plan, or else the session's plan
	const billing = accountBilling ?? billingQuery.data
	const accountPlan = accountBilling?.plan === "unknown" ? null : accountBilling?.plan
	const plan = accountBilling ? (accountPlan ?? null) : sessionPlan

	// a paid plan stays read-only until its billing provider loads, so a Stripe subscriber is never offered the store
	if (isPaidPlan(plan) && !billing) {
		return { canPurchase: false, planManagement: null }
	}
	return toPurchaseOffers({
		platform: "mobile",
		storeOffering: currentStoreOffering,
		plan,
		provider: billing?.provider ?? null,
	})
}
