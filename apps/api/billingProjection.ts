// a billing provider's subscription projected into the one billing_subscriptions row per user: the row write, the
// users.plan sync, the session refresh, the subscription events, and the LiteLLM key reissue every provider shares

import type { AnalyticsEventProperties } from "@carlnotes/contracts/analyticsEvents"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import { type BillingInterval, type BillingProvider, type PaidPlan, PLANS, type Plan } from "@carlnotes/contracts/plans"
import { type DbTransaction, db } from "@carlnotes/db"
import { billingSubscriptions } from "@carlnotes/db/schema/billing"
import { users } from "@carlnotes/db/schema/users"
import { isUserLiteLLMKeyBudgetStale, replaceUserLiteLLMKey } from "@carlnotes/models/litellm"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { eq } from "drizzle-orm"
import { refreshSessionUser } from "./sessions"
import { stripe } from "./stripeClient"

// the billing_subscriptions values for an active paid subscription
export type BillingProjection = {
	provider: BillingProvider
	plan: PaidPlan
	status: string
	providerCustomerId: string
	providerSubscriptionId: string
	currentPeriodEnd: Date | null
	// a payment method on file, and how often the subscription bills
	hasPaymentMethod: boolean
	billingInterval: BillingInterval
}

// the user, the providers whose billing row this call may write or clear, the projection or null to clear that row,
// and the properties its subscription events add, which name a webhook as the entry point unless they say otherwise
export type ApplyBillingProjectionOptions = {
	userId: string
	providers: readonly [BillingProvider, ...BillingProvider[]]
	projection: BillingProjection | null
	eventProperties?: AnalyticsEventProperties
}

// the plan a written projection leaves the user on, the plan before it, the provider its events name, and the Stripe
// subscription a higher store plan replaced
type WrittenProjection = {
	plan: Plan
	planBeforeProjection: Plan
	provider: BillingProvider
	displacedStripeSubscriptionId?: string
}

// how many times a projection tries to reissue the LiteLLM key, and the backoff interval between tries
const MAX_REPLACE_LITELLM_KEY_ATTEMPTS = 3
const REPLACE_LITELLM_KEY_BACKOFF_MS = 1000

/**
 * Upserts the user's billing subscription from a provider's projection, or clears it, then syncs users.plan, reports
 * the subscription event, and reissues the LiteLLM key if the plan changed or the key's budget is stale. A row from
 * another provider stays unless the projection's plan ranks higher, and the conflict is reported with both ids. A
 * Stripe subscription that a higher store plan replaces is canceled at its period end. A user's projections apply one
 * at a time.
 */
export async function applyBillingProjection({
	userId,
	providers,
	projection,
	eventProperties,
}: ApplyBillingProjectionOptions): Promise<void> {
	// write the billing row and users.plan under the user's row lock, then refresh the user's sessions
	const writtenProjection = await db.transaction((transaction) =>
		writeBillingProjection(transaction, { userId, providers, projection }),
	)
	if (!writtenProjection) {
		return
	}
	await refreshSessionUser(userId)

	// the plan the projection left, the Stripe subscription it replaced, and the properties of its subscription event
	const { plan, planBeforeProjection, provider, displacedStripeSubscriptionId } = writtenProjection
	if (displacedStripeSubscriptionId) {
		await cancelDisplacedStripeSubscription(userId, displacedStripeSubscriptionId)
	}
	const planProperties = { entryPoint: "webhook", plan, fromPlan: planBeforeProjection, provider, ...eventProperties }

	// report a subscription that started or ended, or a plan that changed, then reissue the key if the plan changed
	const subscriptionEvent = toSubscriptionEvent(plan, planBeforeProjection)
	if (subscriptionEvent) {
		trackEvent(subscriptionEvent, userId, planProperties)
	}
	await syncUserLiteLLMKey({ userId, plan, planBeforeProjection })
}

// the subscription event a projection reports: a paid plan's start or end, or a change between paid plans. a repeat
// of the same plan reports nothing
function toSubscriptionEvent(
	plan: Plan,
	planBeforeProjection: Plan,
): "subscription_started" | "subscription_canceled" | "plan_changed" | null {
	if (isPaidPlan(plan) !== isPaidPlan(planBeforeProjection)) {
		return isPaidPlan(plan) ? "subscription_started" : "subscription_canceled"
	}
	return isPaidPlan(plan) && planBeforeProjection !== plan ? "plan_changed" : null
}

// stop a Stripe subscription that a store plan replaced from renewing. a failed cancel is reported with the id, and
// never fails the projection that already committed
async function cancelDisplacedStripeSubscription(userId: string, stripeSubscriptionId: string): Promise<void> {
	try {
		await stripe().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true })
	} catch (error) {
		reportError(error, "billing", { userId, stripeSubscriptionId })
	}
}

// lock the user's row, then write the projection's billing row and users.plan. returns null if another provider's row
// stays
async function writeBillingProjection(
	transaction: DbTransaction,
	{ userId, providers, projection }: Omit<ApplyBillingProjectionOptions, "eventProperties">,
): Promise<WrittenProjection | null> {
	// the user's plan, locked until the transaction ends, and the billing row before this projection
	const [user] = await transaction
		.select({ plan: users.plan })
		.from(users)
		.where(eq(users.id, userId))
		.for("no key update")
	const [storedBillingSubscription] = await transaction
		.select({
			provider: billingSubscriptions.provider,
			plan: billingSubscriptions.plan,
			providerSubscriptionId: billingSubscriptions.providerSubscriptionId,
		})
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	const planBeforeProjection = user?.plan ?? "free"

	// keep another provider's row unless the projected plan ranks higher, and report the conflict. a null projection
	// never clears that row
	if (storedBillingSubscription && !providers.includes(storedBillingSubscription.provider)) {
		if (!projection) {
			return null
		}
		reportError(new Error(`billing subscriptions from two providers for user ${userId}`), "billing", {
			userId,
			currentProvider: storedBillingSubscription.provider,
			currentSubscriptionId: storedBillingSubscription.providerSubscriptionId,
			projectedProvider: projection.provider,
			projectedSubscriptionId: projection.providerSubscriptionId,
		})
		if (PLANS[projection.plan].rank <= PLANS[storedBillingSubscription.plan].rank) {
			return null
		}
	}

	// a null projection clears the row and reverts the user to free
	if (!projection) {
		await transaction.delete(billingSubscriptions).where(eq(billingSubscriptions.userId, userId))
		await transaction.update(users).set({ plan: "free" }).where(eq(users.id, userId))
		return { plan: "free", planBeforeProjection, provider: storedBillingSubscription?.provider ?? providers[0] }
	}

	// upsert the billing row, then set users.plan, naming a Stripe subscription that this projection replaced
	await transaction
		.insert(billingSubscriptions)
		.values({ userId, ...projection })
		.onConflictDoUpdate({ target: billingSubscriptions.userId, set: projection })
	await transaction.update(users).set({ plan: projection.plan }).where(eq(users.id, userId))
	const isStripeDisplaced = storedBillingSubscription?.provider === "stripe" && projection.provider !== "stripe"
	return {
		plan: projection.plan,
		planBeforeProjection,
		provider: projection.provider,
		displacedStripeSubscriptionId: isStripeDisplaced ? storedBillingSubscription.providerSubscriptionId : undefined,
	}
}

// the user a projection belongs to, the plan it leaves them on, and the plan they had before it
type SyncUserLiteLLMKeyOptions = { userId: string; plan: Plan; planBeforeProjection: Plan }

// reissue the LiteLLM key at the user's budget if the plan changed or the key's budget is stale. a new key's spend
// starts at zero
async function syncUserLiteLLMKey({ userId, plan, planBeforeProjection }: SyncUserLiteLLMKeyOptions): Promise<void> {
	// keep the key if the plan is unchanged and the key's maximum budget matches the user's budget
	if (planBeforeProjection === plan && !(await isUserLiteLLMKeyBudgetStale(userId))) {
		return
	}

	// a failed reissue leaves the key sized to the old budget, so retry before reporting the failure
	for (let attempt = 0; attempt < MAX_REPLACE_LITELLM_KEY_ATTEMPTS; attempt++) {
		if (await replaceUserLiteLLMKey(userId)) {
			return
		}
		await new Promise((resolve) => setTimeout(resolve, REPLACE_LITELLM_KEY_BACKOFF_MS * (attempt + 1)))
	}

	// report the failure, then throw an error
	const reissueError = new Error(`litellm key reissue failed for user ${userId}`)
	reportError(reissueError, "billing", { userId })
	throw reissueError
}
