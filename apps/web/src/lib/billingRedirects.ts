// the billing redirect: the browser leaves for the Stripe Customer Portal at the url the billing client returns
import { fetchBillingPortalUrl } from "@carlnotes/client/billingClient"

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
