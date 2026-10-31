// App Store and Google Play subscriptions through RevenueCat: the customer read, its projection into the billing row,
// the store sync the app calls after a purchase or a restore, the webhook that re-reads the customer it names, and the
// customer's delete when the account closes
// SETUP: the RevenueCat project's plus and premium entitlements over the store products, and its webhook at
// /api/webhooks/revenuecat with the Authorization value in REVENUECAT_WEBHOOK_AUTHORIZATION

import type { AnalyticsEventProperties } from "@carlnotes/contracts/analyticsEvents"
import type { BillingProvider } from "@carlnotes/contracts/plans"
import {
	type StoreProvider,
	toHighestStorePlan,
	toStoreBillingInterval,
	toStoreSubscriptionId,
} from "@carlnotes/contracts/storeBilling"
import { db } from "@carlnotes/db"
import { users } from "@carlnotes/db/schema/users"
import { isSameSignature } from "@carlnotes/server/hmac"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { applyBillingProjection, type BillingProjection } from "./billingProjection"

// the error for a webhook with a missing or wrong Authorization value, or a body that is not an event
export class RevenueCatWebhookRejectionError extends Error {}

// the RevenueCat REST api, and how long a customer request may take
const REVENUECAT_API_URL = "https://api.revenuecat.com/v1"
const REVENUECAT_REQUEST_TIMEOUT_MS = 10_000

// the providers whose billing row a store sync may write or clear
const STORE_PROVIDERS = ["app_store", "play_store"] as const satisfies readonly [BillingProvider, ...BillingProvider[]]

// the fields of a RevenueCat customer that the projection reads. the entitlements list every entitlement that the
// customer ever had, expired ones included, and a subscription is keyed by its product id without Google's base plan
const revenueCatCustomer = z.object({
	subscriber: z.object({
		original_app_user_id: z.string(),
		entitlements: z.record(
			z.string(),
			z.object({
				expires_date: z.string().nullable(),
				grace_period_expires_date: z.string().nullable().optional(),
				product_identifier: z.string(),
			}),
		),
		subscriptions: z.record(
			z.string(),
			z.object({
				store: z.string(),
				is_sandbox: z.boolean().optional(),
				store_transaction_id: z.union([z.string(), z.number()]).nullable().optional(),
				product_plan_identifier: z.string().nullable().optional(),
				unsubscribe_detected_at: z.string().nullable().optional(),
				billing_issues_detected_at: z.string().nullable().optional(),
			}),
		),
	}),
})

export type RevenueCatCustomer = z.infer<typeof revenueCatCustomer>

// the webhook's event: its type, the app user it names, and on a transfer the app users on each side
const revenueCatWebhookPayload = z.object({
	event: z.object({
		type: z.string(),
		app_user_id: z.string().optional(),
		transferred_from: z.array(z.string()).optional(),
		transferred_to: z.array(z.string()).optional(),
	}),
})

/**
 * Returns the billing row a RevenueCat customer maps to, or null to clear the row. The active entitlement with the
 * highest plan sets the plan, and its product names the interval. The period ends at the later of its expiry and its
 * grace period end. A billing issue reads past_due and an unsubscribe reads canceled, and both stay entitled until the
 * period ends.
 */
export function toStoreSubscription(customer: RevenueCatCustomer, nowMs: number): BillingProjection | null {
	// the entitlements still active now, counting a billing grace period. an entitlement with no expiry never expires
	const { entitlements, original_app_user_id } = customer.subscriber
	const isAfterNow = (date: string | null | undefined): boolean => Date.parse(date ?? "") > nowMs
	const activeEntitlementIds = Object.entries(entitlements)
		.filter(
			([, entitlement]) =>
				entitlement.expires_date === null ||
				isAfterNow(entitlement.expires_date) ||
				isAfterNow(entitlement.grace_period_expires_date),
		)
		.map(([entitlementId]) => entitlementId)

	// the highest active plan and its entitlement
	const plan = toHighestStorePlan(activeEntitlementIds)
	const entitlement = plan ? entitlements[plan] : undefined
	if (!plan || !entitlement) {
		return null
	}

	// the store subscription that grants the entitlement
	const productId = entitlement.product_identifier
	const storeSubscription = findStoreSubscription(customer, productId)
	const provider = storeSubscription ? toStoreProvider(storeSubscription.store) : null
	if (!storeSubscription || !provider) {
		return null
	}

	// the period ends at the later of the expiry and the grace period end
	const periodEndMs = Math.max(
		...[entitlement.expires_date, entitlement.grace_period_expires_date].map((date) => (date ? Date.parse(date) : 0)),
	)

	// the projection: RevenueCat's customer and the store's transaction, the status, the period end, and the interval
	return {
		provider,
		plan,
		status: storeSubscription.billing_issues_detected_at
			? "past_due"
			: storeSubscription.unsubscribe_detected_at
				? "canceled"
				: "active",
		providerCustomerId: original_app_user_id,
		providerSubscriptionId: String(storeSubscription.store_transaction_id ?? productId),
		currentPeriodEnd: entitlement.expires_date ? new Date(periodEndMs) : null,
		hasPaymentMethod: true,
		billingInterval: toStoreBillingInterval(`${productId}:${storeSubscription.product_plan_identifier ?? ""}`),
	}
}

/**
 * Returns the customer without the entitlements that a sandbox subscription grants.
 */
export function withoutSandboxPurchases(customer: RevenueCatCustomer): RevenueCatCustomer {
	const entitlements = Object.entries(customer.subscriber.entitlements).filter(
		([, entitlement]) => !findStoreSubscription(customer, entitlement.product_identifier)?.is_sandbox,
	)
	return { subscriber: { ...customer.subscriber, entitlements: Object.fromEntries(entitlements) } }
}

// the store subscription for a product, keyed by the product id without Google's base plan
function findStoreSubscription(
	customer: RevenueCatCustomer,
	productId: string,
): RevenueCatCustomer["subscriber"]["subscriptions"][string] | undefined {
	const { subscriptions } = customer.subscriber
	return subscriptions[productId] ?? subscriptions[toStoreSubscriptionId(productId)]
}

/**
 * Returns the provider a RevenueCat store name maps to, or null for a store the app does not sell through.
 */
export function toStoreProvider(store: string): StoreProvider | null {
	// RevenueCat names Apple's stores app_store and mac_app_store, and Google's play_store
	if (store === "app_store" || store === "mac_app_store") {
		return "app_store"
	}
	return store === "play_store" ? "play_store" : null
}

/**
 * Reads the user's RevenueCat customer and projects it into their billing row, with the properties its subscription
 * events add. A sandbox purchase counts only where isSandboxPurchaseAllowed allows it. Throws an error if RevenueCat
 * cannot be read.
 */
export async function syncStoreSubscription(userId: string, eventProperties?: AnalyticsEventProperties): Promise<void> {
	const revenueCatAppUserId = await loadRevenueCatAppUserId(userId)
	if (revenueCatAppUserId) {
		await syncRevenueCatCustomer({ userId, revenueCatAppUserId, eventProperties })
	}
}

// the user, the RevenueCat app user id the app logs in with, and the properties the subscription events add
type SyncRevenueCatCustomerOptions = {
	userId: string
	revenueCatAppUserId: string
	eventProperties?: AnalyticsEventProperties
}

// read the RevenueCat customer and project it into the user's billing row
async function syncRevenueCatCustomer({
	userId,
	revenueCatAppUserId,
	eventProperties,
}: SyncRevenueCatCustomerOptions): Promise<void> {
	const customerResponse = await requestRevenueCat("GET", revenueCatAppUserId)
	const customer = revenueCatCustomer.parse(await customerResponse.json())
	const projectedCustomer = isSandboxPurchaseAllowed(userId) ? customer : withoutSandboxPurchases(customer)
	await applyBillingProjection({
		userId,
		providers: STORE_PROVIDERS,
		projection: toStoreSubscription(projectedCustomer, Date.now()),
		eventProperties,
	})
}

/**
 * Deletes the user's RevenueCat customer, so RevenueCat keeps no record of a closed account. A deployment without the
 * RevenueCat secret key has no customers. The store subscription itself bills until it is canceled in the store.
 * Throws an error if RevenueCat rejects the delete.
 */
export async function deleteRevenueCatCustomer(userId: string): Promise<void> {
	const revenueCatAppUserId = Bun.env.REVENUECAT_SECRET_API_KEY ? await loadRevenueCatAppUserId(userId) : null
	if (revenueCatAppUserId) {
		await requestRevenueCat("DELETE", revenueCatAppUserId)
	}
}

/**
 * Whether a sandbox purchase grants its plan: in dev for every user, and elsewhere only for the user ids in
 * REVENUECAT_SANDBOX_USER_IDS, such as App Review's account.
 */
export function isSandboxPurchaseAllowed(userId: string): boolean {
	if (Bun.env.DOPPLER_ENVIRONMENT === "dev") {
		return true
	}
	const sandboxUserIds = (Bun.env.REVENUECAT_SANDBOX_USER_IDS ?? "")
		.split(",")
		.map((sandboxUserId) => sandboxUserId.trim())
	return sandboxUserIds.includes(userId)
}

/**
 * Verifies a RevenueCat webhook and re-reads every user it names. The event's own fields are never applied, so a
 * duplicate or a late delivery projects the same current record. An app user id that is not a user is ignored.
 */
export async function handleRevenueCatWebhook(rawBody: string, authorization: string | undefined): Promise<void> {
	// verify the Authorization value before trusting the body. an unset value throws a plain error
	const expectedAuthorization = Bun.env.REVENUECAT_WEBHOOK_AUTHORIZATION
	if (!expectedAuthorization) {
		throw new Error("REVENUECAT_WEBHOOK_AUTHORIZATION is not set")
	}
	if (!authorization || !isSameSignature({ expectedSignature: expectedAuthorization, signature: authorization })) {
		throw new RevenueCatWebhookRejectionError("missing or wrong revenuecat authorization")
	}

	// reject a body that is not an event the same way
	const payloadResult = revenueCatWebhookPayload.safeParse(parseJson(rawBody))
	if (!payloadResult.success) {
		throw new RevenueCatWebhookRejectionError("revenuecat webhook body is not an event")
	}

	// a transfer names both sides, and every other event the one app user it is about
	const { event } = payloadResult.data
	const appUserIds =
		event.type === "TRANSFER"
			? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
			: [event.app_user_id ?? ""]

	// re-read each named user once, and skip an id that is not a user's
	for (const revenueCatAppUserId of new Set(appUserIds)) {
		const userId = await findRevenueCatUserId(revenueCatAppUserId)
		if (userId) {
			await syncRevenueCatCustomer({ userId, revenueCatAppUserId })
		}
	}
}

// the body parsed as json, or undefined if it is not json
function parseJson(rawBody: string): unknown {
	try {
		return JSON.parse(rawBody)
	} catch {
		return undefined
	}
}

// the RevenueCat app user id the app logs in with for the user, or null for a closed account
async function loadRevenueCatAppUserId(userId: string): Promise<string | null> {
	const [user] = await db
		.select({ revenueCatAppUserId: users.revenueCatAppUserId })
		.from(users)
		.where(eq(users.id, userId))
	return user?.revenueCatAppUserId ?? null
}

// the user a RevenueCat app user id belongs to, or null for an id that is no user's
async function findRevenueCatUserId(revenueCatAppUserId: string): Promise<string | null> {
	if (!revenueCatAppUserId) {
		return null
	}
	const [user] = await db.select({ id: users.id }).from(users).where(eq(users.revenueCatAppUserId, revenueCatAppUserId))
	return user?.id ?? null
}

// read or delete a RevenueCat customer with the secret key, and throw an error if the request fails
async function requestRevenueCat(method: "GET" | "DELETE", revenueCatAppUserId: string): Promise<Response> {
	// require the RevenueCat secret key
	const secretKey = Bun.env.REVENUECAT_SECRET_API_KEY
	if (!secretKey) {
		throw new Error("REVENUECAT_SECRET_API_KEY must be set to reach store subscriptions")
	}

	// send the request, and throw an error if it fails
	const response = await fetch(`${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(revenueCatAppUserId)}`, {
		method,
		headers: { authorization: `Bearer ${secretKey}` },
		signal: AbortSignal.timeout(REVENUECAT_REQUEST_TIMEOUT_MS),
	})
	if (!response.ok) {
		throw new Error(`revenuecat customer ${method} failed: ${response.status}`)
	}
	return response
}
