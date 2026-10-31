// the store billing test fixtures: RevenueCat customers built from purchases, a stubbed RevenueCat and database for a
// store sync with spies on the reads, the reports, the key reissue, and the Stripe cancel, and the webhook and sync
// requests. only tests import it
import { type Mock, mock, spyOn } from "bun:test"
import type { BillingProvider, Plan } from "@carlnotes/contracts/plans"
import { type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as litellm from "@carlnotes/models/litellm"
import type * as monitoring from "@carlnotes/server/monitoring"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { billingRoute } from "./billingRoute"
import type { RevenueCatCustomer } from "./storeBilling"
import * as stripeClient from "./stripeClient"
import { toSignedInApp } from "./testSession"

// the time every projection reads as now, and a time a month before and after it
export const NOW_MS = Date.parse("2026-11-01T00:00:00Z")
export const LAST_MONTH = "2026-10-01T00:00:00Z"
export const NEXT_MONTH = "2026-12-01T00:00:00Z"

// one entitlement and the store subscription that grants it
export type StorePurchase = {
	entitlementId: string
	productId: string
	store?: string
	productPlanId?: string | null
	isSandbox?: boolean
	// when the entitlement and its grace period end
	expiresDate?: string | null
	gracePeriodExpiresDate?: string | null
	// when the store saw an unsubscribe or a failed renewal
	unsubscribeDetectedAt?: string | null
	billingIssuesDetectedAt?: string | null
}

// a plus monthly purchase on the App Store
export const PLUS_MONTHLY = { entitlementId: "plus", productId: "carlnotes.plus.monthly" }

// a test user's RevenueCat app user id is the user id after this prefix
const REVENUECAT_APP_USER_ID_PREFIX = "revenuecat-"

/**
 * Returns a RevenueCat customer holding the given purchases.
 */
export function toRevenueCatCustomer(...storePurchases: StorePurchase[]): RevenueCatCustomer {
	return {
		subscriber: {
			original_app_user_id: "revenuecat-user-1",
			// each purchase's entitlement, unexpired unless it says otherwise
			entitlements: Object.fromEntries(
				storePurchases.map((storePurchase) => [
					storePurchase.entitlementId,
					{
						expires_date: storePurchase.expiresDate === undefined ? NEXT_MONTH : storePurchase.expiresDate,
						grace_period_expires_date: storePurchase.gracePeriodExpiresDate ?? null,
						product_identifier: storePurchase.productId,
					},
				]),
			),
			// each purchase's store subscription, keyed by its product id
			subscriptions: Object.fromEntries(
				storePurchases.map((storePurchase) => [
					storePurchase.productId,
					{
						store: storePurchase.store ?? "app_store",
						is_sandbox: storePurchase.isSandbox ?? false,
						store_transaction_id: `transaction-${storePurchase.productId}`,
						product_plan_identifier: storePurchase.productPlanId ?? null,
						unsubscribe_detected_at: storePurchase.unsubscribeDetectedAt ?? null,
						billing_issues_detected_at: storePurchase.billingIssuesDetectedAt ?? null,
					},
				]),
			),
		},
	}
}

// the user's billing row before a sync, by provider and plan
type BillingRow = { provider: BillingProvider; plan: Plan }

// the database a sync reads: which users exist, the plan before it, and the billing row
type StoreDatabase = { userIds?: string[]; planBeforeSync?: Plan; billingRow?: BillingRow }

// the queries sent, and the spies on RevenueCat, the reports, the key reissue, and the Stripe subscription update
type StoreSyncSpies = {
	sentQueries: SentQuery[]
	fetchSpy: Mock<typeof fetch>
	reportErrorSpy: Mock<typeof monitoring.reportError>
	replaceUserLiteLLMKeySpy: Mock<typeof litellm.replaceUserLiteLLMKey>
	stripeSubscriptionUpdateSpy: Mock<(subscriptionId: string, params: object) => Promise<object>>
}

/**
 * Stubs RevenueCat with each user's customer and the database with the given rows, and returns the spies. The test
 * saves and restores the RevenueCat settings, the pool, and the spies.
 */
export function stubStoreSync(
	customers: Record<string, RevenueCatCustomer | "unreachable">,
	{ userIds = ["user-1"], planBeforeSync = "free", billingRow }: StoreDatabase = {},
): StoreSyncSpies {
	// the RevenueCat values, and a quiet report
	Bun.env.REVENUECAT_SECRET_API_KEY = "sk_revenuecat"
	Bun.env.REVENUECAT_WEBHOOK_AUTHORIZATION = "Bearer webhook-secret"
	const reportErrorSpy = quietErrorReports()

	// the customer read returns the user's record, or fails for an unreachable one
	const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL) => {
		const revenueCatAppUserId = decodeURIComponent(String(url).split("/subscribers/")[1] ?? "")
		const customer = customers[revenueCatAppUserId.replace(REVENUECAT_APP_USER_ID_PREFIX, "")]
		return customer === "unreachable" || !customer
			? new Response("unavailable", { status: 503 })
			: new Response(JSON.stringify(customer))
	}) as typeof fetch)

	// the users, the plan before the sync, and the billing row, and nothing for every write
	const sentQueries = stubConnectionPool((sentQuery) => {
		// the users
		const userRows = toUserRows(sentQuery, userIds)
		if (userRows) {
			return userRows
		}

		// the plan and the billing row before the sync
		if (sentQuery.text.startsWith('select "plan" from "users"')) {
			return [[planBeforeSync]]
		}
		if (sentQuery.text.startsWith('select "provider", "plan", "stripe_subscription_id"')) {
			return billingRow ? [[billingRow.provider, billingRow.plan, "sub_1"]] : []
		}
		return []
	})

	// the key's budget check and reissue, and Stripe's subscription update
	spyOn(litellm, "isUserLiteLLMKeyBudgetStale").mockResolvedValue(false)
	const replaceUserLiteLLMKeySpy = spyOn(litellm, "replaceUserLiteLLMKey").mockResolvedValue(true)
	const stripeSubscriptionUpdateSpy = mock(async (_subscriptionId: string, _params: object) => ({}))
	spyOn(stripeClient, "stripe").mockReturnValue({
		subscriptions: { update: stripeSubscriptionUpdateSpy },
	} as unknown as ReturnType<typeof stripeClient.stripe>)
	return { sentQueries, fetchSpy, reportErrorSpy, replaceUserLiteLLMKeySpy, stripeSubscriptionUpdateSpy }
}

/**
 * Returns the billing row writes a sync sent, as insert or delete.
 */
export function toBillingWrites(sentQueries: SentQuery[]): string[] {
	return sentQueries
		.map((sentQuery) => sentQuery.text)
		.filter((text) => /^(insert into|delete from) "billing_subscriptions"/.test(text))
		.map((text) => text.split(" ")[0] ?? "")
}

/**
 * Posts one RevenueCat event with the given Authorization value.
 */
export async function postRevenueCatEvent(event: Record<string, unknown>, authorization?: string): Promise<Response> {
	return await billingRoute.request("/webhooks/revenuecat", {
		method: "POST",
		headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
		body: JSON.stringify({ api_version: "1.0", event }),
	})
}

/**
 * Posts the store sync as user-1 from the given storefront.
 */
export async function postStoreSync(storefrontCountryCode?: string): Promise<Response> {
	return await toSignedInApp(billingRoute, "user-1").request("/billing/store/sync", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(storefrontCountryCode ? { storefrontCountryCode } : {}),
	})
}

// a listed user's RevenueCat app user id, or the user that id finds, and null for any other query
function toUserRows(sentQuery: SentQuery, userIds: string[]): unknown[][] | null {
	// a listed user id reads its prefixed RevenueCat app user id
	const queriedId = String(sentQuery.values[0])
	if (sentQuery.text.startsWith('select "revenuecat_app_user_id" from "users"')) {
		return userIds.includes(queriedId) ? [[`${REVENUECAT_APP_USER_ID_PREFIX}${queriedId}`]] : []
	}

	// a prefixed RevenueCat app user id finds its listed user
	if (sentQuery.text.startsWith('select "id" from "users"')) {
		const userId = queriedId.replace(REVENUECAT_APP_USER_ID_PREFIX, "")
		return queriedId.startsWith(REVENUECAT_APP_USER_ID_PREFIX) && userIds.includes(userId) ? [[userId]] : []
	}
	return null
}
