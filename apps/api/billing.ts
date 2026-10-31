// Stripe Billing: Checkout, the Customer Portal, the webhook, metered overage, and the account page's billing state
// SETUP: create plus and premium products with monthly and yearly prices, plus a metered manual-scan overage price in
// Stripe

import { checkoutPayload } from "@carlnotes/contracts/payloads"
import { type BillingInterval, isOverageBillable, type PaidPlan, PLANS } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { isStoreProvider } from "@carlnotes/contracts/storeBilling"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { billingSubscriptions } from "@carlnotes/db/schema/billing"
import { users } from "@carlnotes/db/schema/users"
import { appUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq } from "drizzle-orm"
import type Stripe from "stripe"
import { applyBillingProjection, type BillingProjection } from "./billingProjection"
import { syncStoreSubscription } from "./storeBilling"
import { stripe } from "./stripeClient"
import { scansToday } from "./topic/quotas"

// the error for a webhook with no signature, or a signature Stripe's library rejected
export class StripeWebhookSignatureError extends Error {}

// the fields toPaidSubscription reads from a Stripe subscription. a narrow type, so tests can pass plain objects
type StripeSubscriptionFields = {
	id: string
	status: string
	customer: string | { id: string }
	metadata?: Record<string, string> | null
	current_period_end?: number | null
	default_payment_method?: unknown
	// the prices the subscription actually includes, which is what a plan change in the portal rewrites
	items?: { data: { price?: { recurring?: { interval?: string | null } | null } | null }[] }
}

// how long past its period end a store row waits for its expiration event before the account page re-reads it
const STALE_STORE_ROW_MS = DAY_MS

/**
 * Start a Stripe Checkout Session for the plan's price and return its URL. Checkout creates the customer from
 * customer_email. The subscription stores the userId and plan in metadata, so the webhook can update the user's billing
 * state without a reverse price lookup.
 */
export async function createCheckoutSession(
	userId: string,
	email: string,
	plan: PaidPlan,
	billingInterval: "monthly" | "yearly",
): Promise<string> {
	// the base plan price, plus the metered overage item on a monthly plan
	const overageItems = billingInterval === "monthly" ? [{ price: overagePriceId() }] : []
	const checkoutSession = await stripe().checkout.sessions.create({
		mode: "subscription",
		customer_email: email,
		client_reference_id: userId,
		line_items: [{ price: planPriceId(plan, billingInterval), quantity: 1 }, ...overageItems],
		subscription_data: { metadata: { userId, plan, interval: billingInterval } },
		success_url: `${appUrl()}/?billing=success`,
		cancel_url: `${appUrl()}/?billing=cancel`,
	})
	// hosted checkout always returns a url, so a missing one is an error
	if (!checkoutSession.url) {
		throw new Error("stripe checkout session returned no url")
	}
	return checkoutSession.url
}

/**
 * Open the Stripe Customer Portal for the user's active subscription, returning its url. Free users have no customer
 * row.
 */
export async function createPortalSession(userId: string): Promise<string | null> {
	// a user with no Stripe subscription has no Stripe customer to manage
	const stripeBillingSubscription = await loadStripeBillingSubscription(userId)
	if (!stripeBillingSubscription) {
		return null
	}

	// open the portal for the customer and return its url. the portal sends the customer back to the home page
	const session = await stripe().billingPortal.sessions.create({
		customer: stripeBillingSubscription.providerCustomerId,
		return_url: `${appUrl()}/`,
	})
	return session.url
}

/**
 * The account page's billing state: the current plan, who bills it and how often, subscription status for delinquent
 * payments, card-on-file, whether a scan past the limit bills as overage, daily scan usage, and the RevenueCat app user
 * id the app buys as. A store row more than a
 * day past its period end re-reads the RevenueCat customer first, so a missed expiration event does not keep the plan.
 * A failed re-read is reported, and the stored row is read instead.
 */
export async function loadBillingState(userId: string): Promise<BillingState> {
	// load the billing row, and whether it is a store row more than a day past its period end
	const storedBillingSubscription = await loadBillingSubscription(userId)
	const isStaleStoreRow =
		isStoreProvider(storedBillingSubscription?.provider) &&
		storedBillingSubscription?.currentPeriodEnd != null &&
		Date.now() - storedBillingSubscription.currentPeriodEnd.getTime() > STALE_STORE_ROW_MS

	// re-read a stale store row from RevenueCat. a failed re-read is reported, and the stored row is read instead
	const billingSubscription = isStaleStoreRow
		? await syncStoreSubscription(userId)
				.then(() => loadBillingSubscription(userId))
				.catch((error: unknown) => {
					reportError(error, "billing", { outcome: "stale store row read failed" })
					return storedBillingSubscription
				})
		: storedBillingSubscription

	// the plan and the RevenueCat app user id from the user row, and today's scan count against the daily limit
	const [user] = await db
		.select({ plan: users.plan, revenueCatAppUserId: users.revenueCatAppUserId })
		.from(users)
		.where(eq(users.id, userId))

	// a user with no subscription is on the free plan, which bills on no frequency at all, so it defaults to monthly
	const plan = user?.plan ?? "free"
	const billingAccess = {
		provider: billingSubscription?.provider ?? null,
		hasPaymentMethod: billingSubscription?.hasPaymentMethod ?? false,
		billingInterval: billingSubscription?.billingInterval ?? "monthly",
	}
	return {
		plan,
		...billingAccess,
		status: billingSubscription?.status ?? null,
		dailyScansUsed: await scansToday(userId),
		dailyScanLimit: PLANS[plan].dailyScanLimit[billingAccess.billingInterval],
		isOverageBillable: isOverageBillable(billingAccess),
		revenueCatAppUserId: user?.revenueCatAppUserId ?? null,
	}
}

/**
 * Whether the user's plan is billed through a store, which only the store can change.
 */
export async function hasStoreSubscription(userId: string): Promise<boolean> {
	return isStoreProvider((await loadBillingSubscription(userId))?.provider)
}

// the fields of a user's billing row that this file reads
type BillingSubscriptionRow = Pick<
	typeof billingSubscriptions.$inferSelect,
	"provider" | "status" | "currentPeriodEnd" | "hasPaymentMethod" | "billingInterval"
>

// the user's billing row, or undefined for a free user
async function loadBillingSubscription(userId: string): Promise<BillingSubscriptionRow | undefined> {
	const [billingSubscription] = await db
		.select({
			provider: billingSubscriptions.provider,
			status: billingSubscriptions.status,
			currentPeriodEnd: billingSubscriptions.currentPeriodEnd,
			hasPaymentMethod: billingSubscriptions.hasPaymentMethod,
			billingInterval: billingSubscriptions.billingInterval,
		})
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	return billingSubscription
}

/**
 * Verifies and applies a Stripe webhook's subscription event to billing_subscriptions and users.plan.
 */
export async function handleStripeWebhook(rawBody: string, signature: string | undefined): Promise<void> {
	// verify the signature before trusting any event payload. an unset secret throws a plain error, and a missing
	// signature a signature error
	const secret = Bun.env.STRIPE_WEBHOOK_SECRET
	if (!secret) {
		throw new Error("STRIPE_WEBHOOK_SECRET is not set")
	}
	if (!signature) {
		throw new StripeWebhookSignatureError("missing stripe signature")
	}

	// reject a signature the library rejects the same way as a missing one
	const event = await stripe()
		.webhooks.constructEventAsync(rawBody, signature, secret)
		.catch((error: unknown) => {
			throw new StripeWebhookSignatureError(error instanceof Error ? error.message : String(error))
		})

	// every subscription lifecycle event includes the full subscription, so one handler covers create/update/delete
	if (event.type.startsWith("customer.subscription.")) {
		await applySubscriptionState(event.data.object as Stripe.Subscription)
	}
}

// the Stripe statuses that earn paid entitlements
const ENTITLED_STRIPE_STATUSES = new Set(["active", "trialing", "past_due"])

/**
 * The billing_subscriptions values a Stripe subscription maps to, or null to clear the row and revert the user to free.
 * Only a paid-up status can update. A subscription without our plan metadata also gets cleared.
 */
export function toPaidSubscription(subscription: StripeSubscriptionFields): BillingProjection | null {
	// anything not paid up clears the row, reverting the user to free
	if (!ENTITLED_STRIPE_STATUSES.has(subscription.status)) {
		return null
	}

	// the plan is set at checkout, so the checkout body's plan names it. anything else is not one of our paid subscriptions
	const checkoutPlanResult = checkoutPayload.shape.plan.safeParse(subscription.metadata?.plan)
	if (!checkoutPlanResult.success) {
		return null
	}

	const providerCustomerId =
		typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
	return {
		provider: "stripe",
		plan: checkoutPlanResult.data,
		status: subscription.status,
		providerCustomerId,
		providerSubscriptionId: subscription.id,
		currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
		hasPaymentMethod: Boolean(subscription.default_payment_method),
		billingInterval: toBillingInterval(subscription),
	}
}

// how a subscription bills, read from the price it includes instead of from what checkout saved on it
function toBillingInterval(subscription: StripeSubscriptionFields): BillingInterval {
	const priceIntervals = subscription.items?.data.map((item) => item.price?.recurring?.interval)
	if (priceIntervals?.length) {
		return priceIntervals.includes("year") ? "yearly" : "monthly"
	}
	return subscription.metadata?.interval === "yearly" ? "yearly" : "monthly"
}

/**
 * Report one metered manual-scan overage unit to Stripe. A reporting failure never blocks the scan.
 * SETUP: the meter for STRIPE_PRICE_MANUAL_SCAN_OVERAGE must use the event_name in STRIPE_MANUAL_SCAN_OVERAGE_EVENT.
 */
export async function reportManualScanOverage(userId: string): Promise<void> {
	// only a Stripe subscriber with a card reaches overage, so look up their Stripe customer first
	const stripeBillingSubscription = await loadStripeBillingSubscription(userId)
	if (!stripeBillingSubscription) {
		return
	}
	try {
		// a meter event increments the customer's usage. Stripe rolls it onto the subscription's overage line
		await stripe().billing.meterEvents.create({
			event_name: Bun.env.STRIPE_MANUAL_SCAN_OVERAGE_EVENT ?? "manual_scan_overage",
			payload: { stripe_customer_id: stripeBillingSubscription.providerCustomerId, value: "1" },
		})
	} catch (error) {
		// a metering failure is not worth failing the user's scan over. log it and move on
		console.error(`stripe overage metering failed for user ${userId}`, error)
	}
}

/**
 * Total Stripe revenue in cents since the given time, from balance transactions that already net fees and refunds.
 * Returns null if Stripe is unreachable, so the admin totals still render.
 */
export async function readStripeTotalRevenueCents(sinceUnixSeconds: number): Promise<number | null> {
	try {
		// sum every balance transaction since the cutoff. the SDK auto-paginates over the async iterator 100 at a time
		let totalCents = 0
		for await (const transaction of stripe().balanceTransactions.list({
			created: { gte: sinceUnixSeconds },
			limit: 100,
		})) {
			totalCents += transaction.net
		}
		return totalCents
	} catch (error) {
		// a Stripe read failure is not fatal to the admin view. treat failed revenue as unavailable
		console.error("stripe net revenue read failed", error)
		return null
	}
}

// apply a Stripe subscription event to the user's billing row, and ignore a subscription without our user id
async function applySubscriptionState(subscription: Stripe.Subscription): Promise<void> {
	const userId = subscription.metadata?.userId
	if (!userId) {
		return
	}
	await applyBillingProjection({ userId, providers: ["stripe"], projection: toPaidSubscription(subscription) })
}

/**
 * Cancel a user's Stripe subscription right away, so a closed account stops being charged.
 * Does nothing for a free user, and nothing for a store subscription, which only the store can cancel.
 */
export async function cancelUserSubscription(userId: string): Promise<void> {
	// a free user and a store subscriber have no Stripe subscription to cancel
	const stripeBillingSubscription = await loadStripeBillingSubscription(userId)
	if (!stripeBillingSubscription) {
		return
	}
	// cancel immediately instead of at the period end. the account it belongs to is going away
	await stripe().subscriptions.cancel(stripeBillingSubscription.providerSubscriptionId)
}

// a Stripe subscriber's customer and subscription ids
type StripeBillingSubscriptionRow = Pick<
	typeof billingSubscriptions.$inferSelect,
	"providerCustomerId" | "providerSubscriptionId"
>

// the user's Stripe customer and subscription ids, or undefined without a Stripe subscription
async function loadStripeBillingSubscription(userId: string): Promise<StripeBillingSubscriptionRow | undefined> {
	const [stripeBillingSubscription] = await db
		.select({
			providerCustomerId: billingSubscriptions.providerCustomerId,
			providerSubscriptionId: billingSubscriptions.providerSubscriptionId,
		})
		.from(billingSubscriptions)
		.where(and(eq(billingSubscriptions.userId, userId), eq(billingSubscriptions.provider, "stripe")))
	return stripeBillingSubscription
}

// a paid plan's Stripe price id for a monthly or yearly billing interval
function planPriceId(plan: PaidPlan, billingInterval: "monthly" | "yearly"): string {
	const priceKey = `STRIPE_PRICE_${plan.toUpperCase()}_${billingInterval.toUpperCase()}`
	const priceId = Bun.env[priceKey]
	if (!priceId) {
		throw new Error(`${priceKey} must be set to check out the ${plan} ${billingInterval} plan`)
	}
	return priceId
}

// the metered manual-scan overage price id, added to every subscription so that overage can bill on the same invoice
function overagePriceId(): string {
	const priceId = Bun.env.STRIPE_PRICE_MANUAL_SCAN_OVERAGE
	if (!priceId) {
		throw new Error("STRIPE_PRICE_MANUAL_SCAN_OVERAGE must be set for metered manual-scan overage")
	}
	return priceId
}
