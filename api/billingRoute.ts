// the billing routes over the Stripe calls in billing.ts
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import { reportError } from "@shared/monitoring"
import { checkoutPayload } from "@shared/payloads"
import { Hono } from "hono"
import { isAllowed } from "./authorization"
import {
	createCheckoutSession,
	createPortalSession,
	handleStripeWebhook,
	loadBillingState,
	StripeWebhookSignatureError,
} from "./billing"
import { type AppEnv, currentUser, toAnalyticsProperties } from "./currentUser"

// the billing routes: checkout, the portal, the account page state, and the stripe webhook
export const billingRoute = new Hono<AppEnv>()
	.post("/billing/checkout", zValidator("json", checkoutPayload), async (context) => {
		// reject a signed-out visitor
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// open a stripe checkout session for the chosen plan and billing interval and return its url to redirect to
		const { plan, billingInterval } = context.req.valid("json")
		const url = await createCheckoutSession(user.id, user.email, plan, billingInterval)
		// report the checkout the user opened, with the plan they picked and the plan they are on
		trackEvent("checkout_started", user.id, {
			...toAnalyticsProperties(context),
			checkoutPlan: plan,
			interval: billingInterval,
		})
		return context.json({ url })
	})
	.post("/billing/portal", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// open the stripe customer portal, or 404 when the user has no active subscription to manage
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

		// only an admin may see another user's billing state
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		return context.json(await loadBillingState(requestedUserId))
	})
	.post("/webhooks/stripe", async (context) => {
		// verify and apply the stripe event from the raw body. a missing or bad signature responds 400, and any other
		// failure, such as an unset secret or an event that could not be applied, responds 500. both are reported
		try {
			await handleStripeWebhook(await context.req.text(), context.req.header("stripe-signature"))
			return context.json({ received: true })
		} catch (error) {
			// name the outcome in the log and the report, then respond by it
			const isSignatureError = error instanceof StripeWebhookSignatureError
			console.error(isSignatureError ? "stripe webhook rejected" : "stripe webhook failed", error)
			reportError(error, "billing", { outcome: isSignatureError ? "rejected" : "failed" })
			return isSignatureError
				? context.json({ error: "invalid webhook" }, 400)
				: context.json({ error: "webhook failed" }, 500)
		}
	})
