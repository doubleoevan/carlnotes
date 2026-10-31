import { authClient } from "@carlnotes/client/authClient"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import type { BillingInterval, Plan } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { toBillingQueryKey } from "@carlnotes/core/stores/purchaseOffersStore"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Alert } from "react-native"
import { purchaseStorePlan, StoreSyncError } from "@/storePurchases"

/**
 * Returns the call that applies a store sync's billing state to the Plans screen's billing read, the Account screen,
 * and the session's plan.
 */
export function useApplyStoreBilling(): (billing: BillingState) => void {
	const queryClient = useQueryClient()
	const { data: session } = authClient().useSession()
	return (billing) => {
		// write the billing state, reload the Account screen, and re-read the session
		queryClient.setQueryData(toBillingQueryKey(session?.user.id), billing)
		void queryClient.invalidateQueries({ queryKey: ["account"] })
		authClient().$store.notify("$sessionSignal")
	}
}

/**
 * Returns the store purchase for a paid plan and whether one is open. A plan bought or switched in the store reaches
 * the account through the sync, or through the store's event if the sync fails after the charge.
 */
export function useStorePurchase(): {
	isPurchasing: boolean
	purchasePlan: (plan: Plan, billingInterval: BillingInterval) => Promise<void>
} {
	const { data: session } = authClient().useSession()
	const applyStoreBilling = useApplyStoreBilling()
	const [isPurchasing, setIsPurchasing] = useState(false)

	// buy the plan for the signed-in user and show the billing state the sync left
	async function purchasePlan(plan: Plan, billingInterval: BillingInterval): Promise<void> {
		if (!isPaidPlan(plan) || !session) {
			return
		}
		setIsPurchasing(true)
		try {
			const billing = await purchaseStorePlan({ plan, billingInterval })
			if (billing) {
				applyStoreBilling(billing)
			}
		} catch (error) {
			// say whether the store charged. a sync that failed after the charge still bought the plan
			console.error("store purchase failed", error)
			Alert.alert(
				"CarlNotes",
				error instanceof StoreSyncError
					? "Your purchase went through. Your plan will show shortly."
					: "The store didn't finish the purchase. Nothing was charged.",
			)
		} finally {
			setIsPurchasing(false)
		}
	}
	return { isPurchasing, purchasePlan }
}
