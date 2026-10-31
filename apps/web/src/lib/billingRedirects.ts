// the billing redirects: the browser leaves for the Stripe Customer Portal at the url the billing client returns, or
// opens a store's subscription page for a plan bought in the app
import { fetchBillingPortalUrl } from "@carlnotes/client/billingClient"
import { STORE_MANAGEMENT_URLS } from "@carlnotes/contracts/storeBilling"
import type { PlanManagement } from "@carlnotes/core/lib/storefrontPurchaseRules"

/**
 * Sends the browser to the Stripe Customer Portal. Returns false if there is no subscription to manage.
 */
export async function openBillingPortal(): Promise<boolean> {
	const portalUrl = await fetchBillingPortalUrl()
	if (portalUrl === null) {
		return false
	}
	window.location.href = portalUrl
	return true
}

/**
 * Opens where a paid plan is managed: the Stripe Customer Portal in this tab, or the store's subscription page in a new
 * one. Returns whether this tab leaves for the portal.
 */
export async function openPlanManagement(planManagement: PlanManagement): Promise<boolean> {
	if (planManagement === "portal" || planManagement === "web") {
		return openBillingPortal()
	}
	window.open(STORE_MANAGEMENT_URLS[planManagement], "_blank", "noopener,noreferrer")
	return false
}
