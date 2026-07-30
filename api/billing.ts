// Stripe Billing: Checkout, the Customer Portal, and the subscription webhook that keeps billing_subscriptions and users.plan in sync.
// SETUP: create plus and premium products with monthly and yearly prices, plus a metered manual-scan overage price in Stripe
import type { BillingState } from "@shared/contracts"
import { PLANS, type Plan } from "@shared/plans"
import { eq } from "drizzle-orm"
import Stripe from "stripe"
import { db } from "../db"
import { billingSubscriptions, users } from "../db/schema"
import { replaceUserLiteLLMKey } from "./authorization"
import { scansToday } from "./topic/quotas"

// a paid plan is any plan but free. only paid plans map to a Stripe price
type PaidPlan = Exclude<Plan, "free">

// the fields toPaidSubscription reads from a Stripe subscription. a narrow type, so tests can pass plain objects
type StripeSubscriptionFields = {
	id: string
	status: string
	customer: string | { id: string }
	metadata?: Record<string, string> | null
	current_period_end?: number | null
	default_payment_method?: unknown
}

// the billing_subscriptions values for an active paid subscription
type SubscriptionProjection = {
	plan: PaidPlan
	status: string
	stripeCustomerId: string
	stripeSubscriptionId: string
	currentPeriodEnd: Date | null
	hasPaymentMethod: boolean
}

/**
 * Start a Stripe Checkout Session for the plan's price and return its URL. Checkout creates the customer from customer_email.
 * The subscription carries the userId and plan in metadata, so the webhook can update the user's billing state without a reverse price lookup.
 */
export async function createCheckoutSession(
	userId: string,
	email: string,
	plan: PaidPlan,
	interval: "monthly" | "yearly",
): Promise<string> {
	// the base plan price plus the metered overage item, so manual-scan overage bills on the same subscription
	const checkoutSession = await stripe().checkout.sessions.create({
		mode: "subscription",
		customer_email: email,
		client_reference_id: userId,
		line_items: [{ price: planPriceId(plan, interval), quantity: 1 }, { price: overagePriceId() }],
		subscription_data: { metadata: { userId, plan } },
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
 * Open the Stripe Customer Portal for the user's active subscription, returning its url. Free users have no customer row.
 */
export async function createPortalSession(userId: string): Promise<string | null> {
	// a user with no active billing subscription has no Stripe customer to manage
	const [customerRow] = await db
		.select({ stripeCustomerId: billingSubscriptions.stripeCustomerId })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	if (!customerRow) {
		return null
	}

	// hand the customer to the portal and return to where it sends them back
	const session = await stripe().billingPortal.sessions.create({
		customer: customerRow.stripeCustomerId,
		return_url: `${appUrl()}/`,
	})
	return session.url
}

/**
 * The account page's billing state: the current plan, subscription status for delinquent payments, card-on-file, and daily scan usage.
 */
export async function loadBillingState(userId: string): Promise<BillingState> {
	// the plan from the user row, the status and card from the subscription, and today's scan count against the daily limit
	const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId))
	const [subscription] = await db
		.select({ status: billingSubscriptions.status, hasPaymentMethod: billingSubscriptions.hasPaymentMethod })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	const plan = user?.plan ?? "free"
	return {
		plan,
		status: subscription?.status ?? null,
		hasPaymentMethod: subscription?.hasPaymentMethod ?? false,
		dailyScansUsed: await scansToday(userId),
		dailyScanLimit: PLANS[plan].dailyScanLimit,
	}
}

/**
 * Verify and handle a Stripe webhook: update the billing_subscriptions and users.plan from the subscription event.
 * Throws on a bad signature so the route answers 400 and Stripe retries.
 */
export async function handleStripeWebhook(rawBody: string, signature: string | undefined): Promise<void> {
	// verify the signature before trusting any event payload
	const secret = Bun.env.STRIPE_WEBHOOK_SECRET
	if (!secret || !signature) {
		throw new Error("missing stripe signature or STRIPE_WEBHOOK_SECRET")
	}
	const event = await stripe().webhooks.constructEventAsync(rawBody, signature, secret)

	// every subscription lifecycle event carries the full subscription, so one handler covers create/update/delete
	if (event.type.startsWith("customer.subscription.")) {
		await applySubscriptionState(event.data.object as Stripe.Subscription)
	}
}

// the Stripe statuses that earn paid entitlements. past_due keeps them while Stripe retries the card, while
// "incomplete" must not, or an abandoned checkout would upgrade the user for free
const ENTITLED_STRIPE_STATUSES = new Set(["active", "trialing", "past_due"])

/**
 * The billing_subscriptions values a Stripe subscription maps to, or null to clear the row and revert the user to free.
 * Only a paid-up status can update. A subscription without our plan metadata also gets cleared.
 */
export function toPaidSubscription(subscription: StripeSubscriptionFields): SubscriptionProjection | null {
	// anything not paid up clears the row, reverting the user to free
	if (!ENTITLED_STRIPE_STATUSES.has(subscription.status)) {
		return null
	}

	// the plan is set at checkout. anything else is not one of our paid subscriptions
	const plan = subscription.metadata?.plan
	if (plan !== "plus" && plan !== "premium") {
		return null
	}

	// mirror the Stripe status, customer, period end, and card-on-file flag
	const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
	return {
		plan,
		status: subscription.status,
		stripeCustomerId,
		stripeSubscriptionId: subscription.id,
		currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
		hasPaymentMethod: Boolean(subscription.default_payment_method),
	}
}

/**
 * Report one metered manual-scan overage unit to Stripe. A reporting failure never blocks the scan.
 * SETUP: the meter behind STRIPE_PRICE_MANUAL_SCAN_OVERAGE must use the event_name in STRIPE_MANUAL_SCAN_OVERAGE_EVENT.
 */
export async function reportManualScanOverage(userId: string): Promise<void> {
	// only a subscribed user with a card reaches overage, so look up their Stripe customer first
	const [customerRow] = await db
		.select({ stripeCustomerId: billingSubscriptions.stripeCustomerId })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	if (!customerRow) {
		return
	}
	try {
		// a meter event increments the customer's usage. Stripe rolls it onto the subscription's overage line
		await stripe().billing.meterEvents.create({
			event_name: Bun.env.STRIPE_MANUAL_SCAN_OVERAGE_EVENT ?? "manual_scan_overage",
			payload: { stripe_customer_id: customerRow.stripeCustomerId, value: "1" },
		})
	} catch (error) {
		// a metering failure is not worth failing the user's scan over. log it and move on
		console.error(`stripe overage metering failed for user ${userId}`, error)
	}
}

/**
 * Total Stripe revenue in cents since the given time, from balance transactions that already net fees and refunds.
 * Returns null when Stripe is unreachable, so the admin totals still render.
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

// upsert the billing subscription keyed by user ID, or clear it, then update the users.plan and reissue the LiteLLM key
async function applySubscriptionState(subscription: Stripe.Subscription): Promise<void> {
	// subscriptions we created must have a userId. ignore anything else
	const userId = subscription.metadata?.userId
	if (!userId) {
		return
	}

	// a null paid subscription clears the billing_subscriptions row and reverts the user to free
	const paidSubscription = toPaidSubscription(subscription)
	if (!paidSubscription) {
		await db.delete(billingSubscriptions).where(eq(billingSubscriptions.userId, userId))
		await syncUserPlan(userId, "free")
		return
	}

	// upsert the billing_subscriptions row, then update the users.plan
	await db
		.insert(billingSubscriptions)
		.values({ userId, ...paidSubscription })
		.onConflictDoUpdate({ target: billingSubscriptions.userId, set: paidSubscription })
	await syncUserPlan(userId, paidSubscription.plan)
}

// set users.plan to the updated plan and reissue the LiteLLM key with the new plan's budget
async function syncUserPlan(userId: string, plan: Plan): Promise<void> {
	await db.update(users).set({ plan }).where(eq(users.id, userId))
	await replaceUserLiteLLMKey(userId)
}

// the Stripe client, requiring the secret key
function stripe(): Stripe {
	const stripeSecretKey = Bun.env.STRIPE_SECRET_KEY
	if (!stripeSecretKey) {
		throw new Error("STRIPE_SECRET_KEY must be set to reach Stripe")
	}
	return new Stripe(stripeSecretKey)
}

// a paid plan's Stripe price id for a monthly or yearly interval
function planPriceId(plan: PaidPlan, interval: "monthly" | "yearly"): string {
	const priceKey = `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`
	const priceId = Bun.env[priceKey]
	if (!priceId) {
		throw new Error(`${priceKey} must be set to check out the ${plan} ${interval} plan`)
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

// the app url for checkout redirects, reusing Better Auth's configured base url
function appUrl(): string {
	return Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173"
}
