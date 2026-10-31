// the billing routes over the Stripe calls in billing.ts and the store calls in storeBilling.ts

import { isNativePlatform, PLATFORM_HEADER } from "@carlnotes/contracts/clientTelemetry"
import { checkoutPayload, storeCheckoutPayload, storeSubscriptionSyncPayload } from "@carlnotes/contracts/payloads"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { type Context, Hono } from "hono"
import { isAllowed } from "./authorization"
import {
	createCheckoutSession,
	createPortalSession,
	handleStripeWebhook,
	hasStoreSubscription,
	loadBillingState,
	StripeWebhookSignatureError,
} from "./billing"
import { type AppEnv, currentUser, toAnalyticsProperties } from "./currentUser"
import { storeBillingRateLimiter } from "./rateLimit"
import { handleRevenueCatWebhook, RevenueCatWebhookRejectionError, syncStoreSubscription } from "./storeBilling"

// the billing routes: checkout, the portal, the account page state, the store purchase start and sync, and the Stripe
// and RevenueCat webhooks
export const billingRoute = new Hono<AppEnv>()
	.post("/billing/checkout", zValidator("json", checkoutPayload), async (context) => {
		// reject a signed-out visitor
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// a store subscriber changes the plan in the store, so a second subscription through Stripe is rejected
		if (await hasStoreSubscription(user.id)) {
			return context.json({ error: "store subscription" }, 409)
		}

		// open a stripe checkout session for the chosen plan and billing interval and return its url to redirect to
		const { plan, billingInterval } = context.req.valid("json")
		const url = await createCheckoutSession(user.id, user.email, plan, billingInterval)
		// report the checkout the user opened, with the plan they chose, the plan they are on, and Stripe as the provider
		trackEvent("checkout_started", user.id, {
			...toAnalyticsProperties(context),
			checkoutPlan: plan,
			interval: billingInterval,
			provider: "stripe",
		})
		return context.json({ url })
	})
	.post("/billing/portal", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// open the stripe customer portal, or 404 if the user has no active subscription to manage
		const url = await createPortalSession(userId)
		return url ? context.json({ url }) : context.json({ error: "no subscription" }, 404)
	})
	.get("/billing/state", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// the account page's plan, daily scan usage, card-on-file, and payment status
		const requestedUserId = context.req.query("userId")
		if (!requestedUserId || requestedUserId === userId) {
			return context.json(await loadBillingState(userId))
		}

		// only an admin may see another user's billing state, and the 404 hides it from everyone else
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(await loadBillingState(requestedUserId))
	})
	.post(
		"/billing/store/checkout",
		storeBillingRateLimiter,
		zValidator("json", storeCheckoutPayload),
		async (context) => {
			// reject a signed-out visitor, and a request that is not from the app
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}
			const platform = context.req.header(PLATFORM_HEADER)
			if (!isNativePlatform(platform)) {
				return context.json({ error: "store purchases are in the app" }, 400)
			}

			// report the store purchase the user started, with the store and the storefront it is sold in
			const { plan, billingInterval, storefrontCountryCode } = context.req.valid("json")
			trackEvent("checkout_started", userId, {
				...toAnalyticsProperties(context),
				checkoutPlan: plan,
				interval: billingInterval,
				provider: platform === "ios" ? "app_store" : "play_store",
				storefrontCountryCode: storefrontCountryCode ?? "unknown",
			})
			return context.json({ ok: true })
		},
	)
	.post(
		"/billing/store/sync",
		storeBillingRateLimiter,
		zValidator("json", storeSubscriptionSyncPayload),
		async (context) => {
			// reject a signed-out visitor
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}

			// project the user's store subscription from RevenueCat. a failed read is reported and responds 502
			const { storefrontCountryCode } = context.req.valid("json")
			try {
				await syncStoreSubscription(userId, {
					entryPoint: "mobile",
					storefrontCountryCode: storefrontCountryCode ?? "unknown",
				})
			} catch (error) {
				console.error("store subscription sync failed", error)
				reportError(error, "billing", { outcome: "store sync failed" })
				return context.json({ error: "store sync failed" }, 502)
			}
			return context.json(await loadBillingState(userId))
		},
	)
	.post("/webhooks/revenuecat", async (context) => {
		// verify the event and re-read each user it names. a missing or wrong Authorization value or a malformed body
		// responds 400, and a failed read or write responds 500 so RevenueCat sends the event again. both are reported
		try {
			await handleRevenueCatWebhook(await context.req.text(), context.req.header("authorization"))
			return context.json({ received: true })
		} catch (error) {
			const isRejection = error instanceof RevenueCatWebhookRejectionError
			return toWebhookFailureResponse(context, { webhookName: "revenuecat", isRejection, error })
		}
	})
	.post("/webhooks/stripe", async (context) => {
		// verify and apply the stripe event from the raw body. a missing or bad signature responds 400, and any other
		// failure, such as an unset secret or an event that could not be applied, responds 500. both are reported
		try {
			await handleStripeWebhook(await context.req.text(), context.req.header("stripe-signature"))
			return context.json({ received: true })
		} catch (error) {
			const isRejection = error instanceof StripeWebhookSignatureError
			return toWebhookFailureResponse(context, { webhookName: "stripe", isRejection, error })
		}
	})

// the webhook that failed, whether it rejected the event, and the error
type WebhookFailureOptions = { webhookName: string; isRejection: boolean; error: unknown }

// log and report a webhook failure by its outcome, then respond 400 to a rejected event and 500 to any other failure
function toWebhookFailureResponse(
	context: Context,
	{ webhookName, isRejection, error }: WebhookFailureOptions,
): Response {
	console.error(`${webhookName} webhook ${isRejection ? "rejected" : "failed"}`, error)
	reportError(error, "billing", { outcome: isRejection ? "rejected" : "failed" })
	return isRejection ? context.json({ error: "invalid webhook" }, 400) : context.json({ error: "webhook failed" }, 500)
}
