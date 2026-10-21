// Stripe Billing: Checkout, the Customer Portal
// SETUP: create plus and premium products with monthly and yearly prices, plus a metered manual-scan overage price in
// Stripe

import { isPaidPlan } from "@carlnotes/contracts/enums"
import { checkoutPayload } from "@carlnotes/contracts/payloads"
import { type BillingInterval, PLANS, type Plan } from "@carlnotes/contracts/plans"
import type { BillingState } from "@carlnotes/contracts/profiles"
import { db } from "@carlnotes/db"
import { billingSubscriptions } from "@carlnotes/db/schema/billing"
import { users } from "@carlnotes/db/schema/users"
import { isUserLiteLLMKeyBudgetStale, replaceUserLiteLLMKey } from "@carlnotes/models/litellm"
import { trackEvent } from "@carlnotes/server/analytics"
import { appUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { eq } from "drizzle-orm"
import Stripe from "stripe"
import { refreshSessionUser } from "./sessions"
import { scansToday } from "./topic/quotas"

// a paid plan is any plan but free. only paid plans map to a Stripe price
type PaidPlan = Exclude<Plan, "free">

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

// the billing_subscriptions values for an active paid subscription
type SubscriptionProjection = {
	plan: PaidPlan
	status: string
	stripeCustomerId: string
	stripeSubscriptionId: string
	currentPeriodEnd: Date | null
	// a card to charge, and how often the subscription bills. only a monthly one includes the metered overage price
	hasPaymentMethod: boolean
	billingInterval: BillingInterval
}

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
 * The account page's billing state: the current plan and how often it bills,
 * subscription status for delinquent payments, card-on-file, and daily scan usage.
 */
export async function loadBillingState(userId: string): Promise<BillingState> {
	// the plan from the user row, the status and card from the subscription, and today's scan count against the daily
	// limit
	const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId))
	const [subscription] = await db
		.select({
			status: billingSubscriptions.status,
			hasPaymentMethod: billingSubscriptions.hasPaymentMethod,
			billingInterval: billingSubscriptions.billingInterval,
		})
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))

	// a user with no subscription is on the free plan, which bills on no frequency at all, so it defaults to monthly
	const plan = user?.plan ?? "free"
	const billingInterval = subscription?.billingInterval ?? "monthly"
	return {
		plan,
		billingInterval,
		status: subscription?.status ?? null,
		hasPaymentMethod: subscription?.hasPaymentMethod ?? false,
		dailyScansUsed: await scansToday(userId),
		dailyScanLimit: PLANS[plan].dailyScanLimit[billingInterval],
	}
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

// how many times a subscription event tries to reissue the LiteLLM key, and the backoff interval between tries
const MAX_REPLACE_LITELLM_KEY_ATTEMPTS = 3
const REPLACE_LITELLM_KEY_BACKOFF_MS = 1000

/**
 * The billing_subscriptions values a Stripe subscription maps to, or null to clear the row and revert the user to free.
 * Only a paid-up status can update. A subscription without our plan metadata also gets cleared.
 */
export function toPaidSubscription(subscription: StripeSubscriptionFields): SubscriptionProjection | null {
	// anything not paid up clears the row, reverting the user to free
	if (!ENTITLED_STRIPE_STATUSES.has(subscription.status)) {
		return null
	}

	// the plan is set at checkout, so the checkout body's plan names it. anything else is not one of our paid subscriptions
	const checkoutPlanResult = checkoutPayload.shape.plan.safeParse(subscription.metadata?.plan)
	if (!checkoutPlanResult.success) {
		return null
	}

	const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
	return {
		plan: checkoutPlanResult.data,
		status: subscription.status,
		stripeCustomerId,
		stripeSubscriptionId: subscription.id,
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

// upsert the billing subscription keyed by user ID, or clear it, then update the users.plan, and reissue the LiteLLM
// key if the plan changed or the key's budget is stale
async function applySubscriptionState(subscription: Stripe.Subscription): Promise<void> {
	// subscriptions we created must have a userId. ignore anything else
	const userId = subscription.metadata?.userId
	if (!userId) {
		return
	}

	// the user's plan before this event
	const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId))
	const planBeforeEvent = user?.plan ?? "free"

	// a null paid subscription clears the billing_subscriptions row and reverts the user to free
	const paidSubscription = toPaidSubscription(subscription)
	if (!paidSubscription) {
		await db.delete(billingSubscriptions).where(eq(billingSubscriptions.userId, userId))
		await syncUserPlan({ userId, plan: "free" })
		// report the cancellation of a paid plan. a repeated clear of a free user reports nothing
		if (isPaidPlan(planBeforeEvent)) {
			trackEvent("subscription_canceled", userId, { entryPoint: "webhook", plan: "free", fromPlan: planBeforeEvent })
		}
		await syncUserLiteLLMKey({ userId, plan: "free", planBeforeEvent })
		return
	}

	// upsert the billing_subscriptions row, then update the users.plan
	await db
		.insert(billingSubscriptions)
		.values({ userId, ...paidSubscription })
		.onConflictDoUpdate({ target: billingSubscriptions.userId, set: paidSubscription })
	await syncUserPlan({ userId, plan: paidSubscription.plan })

	// report a subscription that started, or a plan that changed. a repeated event for the same plan reports nothing
	const planProperties = { entryPoint: "webhook", plan: paidSubscription.plan, fromPlan: planBeforeEvent }
	if (!isPaidPlan(planBeforeEvent)) {
		trackEvent("subscription_started", userId, planProperties)
	} else if (planBeforeEvent !== paidSubscription.plan) {
		trackEvent("plan_changed", userId, planProperties)
	}
	await syncUserLiteLLMKey({ userId, plan: paidSubscription.plan, planBeforeEvent })
}

// the user a subscription event belongs to, and the plan it leaves them on
type SyncUserPlanOptions = { userId: string; plan: Plan }

// set users.plan and the user's sessions to the event's plan
async function syncUserPlan({ userId, plan }: SyncUserPlanOptions): Promise<void> {
	await db.update(users).set({ plan }).where(eq(users.id, userId))
	await refreshSessionUser(userId)
}

// the user a subscription event belongs to, the plan it leaves them on, and the plan they had before it
type SyncUserLiteLLMKeyOptions = SyncUserPlanOptions & { planBeforeEvent: Plan }

// reissue the LiteLLM key at the user's budget if the plan changed or the key's budget is stale. a new key's spend
// starts at zero
async function syncUserLiteLLMKey({ userId, plan, planBeforeEvent }: SyncUserLiteLLMKeyOptions): Promise<void> {
	// keep the key if the plan is unchanged and the key's maximum budget matches the user's budget
	if (planBeforeEvent === plan && !(await isUserLiteLLMKeyBudgetStale(userId))) {
		return
	}

	// a failed reissue leaves the key sized to the old budget, so retry before reporting the failure
	for (let attempt = 0; attempt < MAX_REPLACE_LITELLM_KEY_ATTEMPTS; attempt++) {
		if (await replaceUserLiteLLMKey(userId)) {
			return
		}
		await new Promise((resolve) => setTimeout(resolve, REPLACE_LITELLM_KEY_BACKOFF_MS * (attempt + 1)))
	}

	// report the failure, then throw an error so the webhook responds 500 and Stripe sends the event again
	const reissueError = new Error(`litellm key reissue failed for user ${userId}`)
	reportError(reissueError, "billing", { userId })
	throw reissueError
}

/**
 * Cancel a user's Stripe subscription right away, so a closed account stops being charged.
 * Does nothing for a user on the free plan, who has no subscription row at all.
 */
export async function cancelUserSubscription(userId: string): Promise<void> {
	// a free user has no subscription row, so there is nothing at Stripe to cancel
	const [subscription] = await db
		.select({ stripeSubscriptionId: billingSubscriptions.stripeSubscriptionId })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	if (!subscription) {
		return
	}
	// cancel immediately instead of at the period end. the account it belongs to is going away
	await stripe().subscriptions.cancel(subscription.stripeSubscriptionId)
}

// the Stripe client, requiring the secret key
function stripe(): Stripe {
	const stripeSecretKey = Bun.env.STRIPE_SECRET_KEY
	if (!stripeSecretKey) {
		throw new Error("STRIPE_SECRET_KEY must be set to reach Stripe")
	}
	return new Stripe(stripeSecretKey)
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
