// the typed client for the billing and admin routes. AppType is imported types-only, so no api code enters the ui bundle
import type { ActivityTopic, AdminConsoleResponse, BillingState } from "@shared/contracts"
import { hc } from "hono/client"
import type { AppType } from "../../../api"

// same-origin client, like the topic client. in dev vite forwards /api to the Hono server
const client = hc<AppType>(window.location.origin)

// start Stripe Checkout for a plan and billing interval, then redirect the browser to the hosted page
export async function startCheckout(plan: "plus" | "premium", billingInterval: "monthly" | "yearly"): Promise<void> {
	const response = await client.api.billing.checkout.$post({ json: { plan, billingInterval } })
	if (!response.ok) {
		throw new Error(`checkout failed: ${response.status}`)
	}
	const { url } = (await response.json()) as { url: string }
	window.location.href = url
}

// open the Stripe Customer Portal, redirecting the browser
// returns false when there is no subscription to manage
export async function openBillingPortal(): Promise<boolean> {
	const response = await client.api.billing.portal.$post()
	if (!response.ok) {
		return false
	}
	// redirect to the portal and report success
	const { url } = (await response.json()) as { url: string }
	window.location.href = url
	return true
}

// the current user's billing state for the account page
export async function fetchBillingState(userId?: string): Promise<BillingState> {
	// the user's own billing state, or another user's for an admin to view
	const response = await client.api.billing.state.$get({ query: userId ? { userId } : {} })
	// a rejected read carries an error body, which would otherwise parse as a billing state
	if (!response.ok) {
		throw new Error(`billing state failed: ${response.status}`)
	}
	return (await response.json()) as BillingState
}

// the admin console payload: the users table and the totals summaries
// throws when the caller is not an admin
export async function fetchAdminConsole(): Promise<AdminConsoleResponse> {
	const response = await client.api.admin.console.$get()
	if (!response.ok) {
		throw new Error(`admin console failed: ${response.status}`)
	}
	return (await response.json()) as AdminConsoleResponse
}

// change a user's role from the admin table. returns false if the api rejects the change
export async function sendUserRole(userId: string, role: "admin" | "user"): Promise<boolean> {
	const response = await client.api.admin.users[":id"].role.$post({ param: { id: userId }, json: { role } })
	return response.ok
}

// one user's topics, read when an admin opens their row in the console
export async function fetchAdminUserTopics(userId: string): Promise<ActivityTopic[]> {
	const response = await client.api.admin.users[":id"].topics.$get({ param: { id: userId } })
	if (!response.ok) {
		throw new Error(`admin user topics failed: ${response.status}`)
	}
	return ((await response.json()) as { topics: ActivityTopic[] }).topics
}

// set or clear a user's budget override in cents from the admin table
export async function sendUserBudgetOverride(userId: string, budgetOverrideCents: number | null): Promise<void> {
	await client.api.admin.users[":id"].budget.$post({ param: { id: userId }, json: { budgetOverrideCents } })
}

// close another user's account from the admin console. throws on a rejection, so the table can say it failed
export async function sendUserDelete(userId: string): Promise<void> {
	const response = await client.api.admin.users[":id"].$delete({ param: { id: userId } })
	if (!response.ok) {
		throw new Error(`user delete failed: ${response.status}`)
	}
}
