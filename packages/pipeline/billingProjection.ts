// a billing provider's subscription or an admin plan change projected into the one billing_subscriptions row per user:
// the row write, the users.plan sync, the session refresh, the subscription events, and the LiteLLM key reissue every
// provider shares

import type { AnalyticsEventProperties } from "@carlnotes/contracts/analyticsEvents"
import { isPaidPlan } from "@carlnotes/contracts/enums"
import {
	type BillingInterval,
	type BillingSubscriptionProvider,
	type PaidPlan,
	PLANS,
	type Plan,
} from "@carlnotes/contracts/plans"
import { type DbTransaction, db } from "@carlnotes/db"
import { billingSubscriptions } from "@carlnotes/db/schema/billing"
import { users } from "@carlnotes/db/schema/users"
import { refreshSessionUser } from "@carlnotes/db/sessions"
import { isUserLiteLLMKeyBudgetStale, replaceUserLiteLLMKey } from "@carlnotes/models/litellm"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { stripe } from "@carlnotes/server/stripeClient"
import { eq } from "drizzle-orm"

// the billing_subscriptions values for an active paid subscription or admin plan change
export type BillingProjection = {
	provider: BillingSubscriptionProvider
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
// the one subscription a null projection may clear, a write that commits with the projection, and the properties its
// subscription events add, which name a webhook as the entry point unless they say otherwise
export type ApplyBillingProjectionOptions = {
	userId: string
	providers: readonly [BillingSubscriptionProvider, ...BillingSubscriptionProvider[]]
	projection: BillingProjection | null
	clearedSubscriptionId?: string
	writeWithProjection?: (transaction: DbTransaction) => Promise<void>
	eventProperties?: AnalyticsEventProperties
}

// the plan a written projection leaves the user on, the plan before it, the provider its events name, and the Stripe
// subscription a higher store plan replaced
type WrittenProjection = {
	plan: Plan
	planBeforeProjection: Plan
	provider: BillingSubscriptionProvider
	displacedStripeSubscriptionId?: string
}

// how many times a projection tries to reissue the LiteLLM key, and the backoff interval between tries
const MAX_REPLACE_LITELLM_KEY_ATTEMPTS = 3
const REPLACE_LITELLM_KEY_BACKOFF_MS = 1000

/**
 * Upserts the user's billing subscription from a provider's projection, or clears it, then syncs users.plan, reports
 * the subscription event, and reissues the LiteLLM key if the plan changed or the key's budget is stale. A row from
 * another provider stays unless the projection's plan ranks higher, and the conflict is reported with both ids. A plan
 * admin plan change gives way to any provider's projection, and never replaces a provider's row. A Stripe subscription
 * that a higher store plan replaces is canceled at its period end. A user's projections apply one at a time. Returns
 * false if another provider's row stayed.
 */
export async function applyBillingProjection({
	userId,
	providers,
	projection,
	clearedSubscriptionId,
	writeWithProjection,
	eventProperties,
}: ApplyBillingProjectionOptions): Promise<boolean> {
	// write the billing row, users.plan, and the caller's write under the user's row lock
	const writtenProjection = await db.transaction(async (transaction) => {
		const writtenBillingProjection = await writeBillingProjection(transaction, {
			userId,
			providers,
			projection,
			clearedSubscriptionId,
		})
		// the caller's write commits only with a written projection
		if (writtenBillingProjection) {
			await writeWithProjection?.(transaction)
		}
		return writtenBillingProjection
	})

	// another provider's row stayed, or the sessions follow the written plan
	if (!writtenProjection) {
		return false
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
	return true
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
	{
		userId,
		providers,
		projection,
		clearedSubscriptionId,
	}: Omit<ApplyBillingProjectionOptions, "eventProperties" | "writeWithProjection">,
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

	// keep the stored row if this projection may not replace or clear it
	if (isStoredRowKept({ userId, providers, projection, clearedSubscriptionId, storedBillingSubscription })) {
		return null
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

// the user, the providers, the projection, the subscription a null projection may clear, and the stored billing row
type IsStoredRowKeptOptions = Omit<ApplyBillingProjectionOptions, "eventProperties" | "writeWithProjection"> & {
	storedBillingSubscription?: { provider: BillingSubscriptionProvider; plan: Plan; providerSubscriptionId: string }
}

// keep another provider's row unless the projected plan ranks higher, and report the conflict. a null projection never
// clears that row. an admin plan change never replaces a provider's row, and a provider's projection replaces an admin
// plan change without a report. a null projection never clears an admin plan change it does not name, nor a
// subscription other than the one it clears
function isStoredRowKept({
	userId,
	providers,
	projection,
	clearedSubscriptionId,
	storedBillingSubscription,
}: IsStoredRowKeptOptions): boolean {
	if (!storedBillingSubscription) {
		return false
	}

	// a null projection keeps another provider's row and a subscription other than the one it clears
	const isOtherProviderRow = !providers.includes(storedBillingSubscription.provider)
	const isOtherSubscriptionRow =
		clearedSubscriptionId !== undefined && storedBillingSubscription.providerSubscriptionId !== clearedSubscriptionId
	if (!projection) {
		return isOtherProviderRow || isOtherSubscriptionRow
	}

	// any projection replaces its own provider's row or an admin plan change, and an admin plan change never replaces a
	// provider's row
	if (!isOtherProviderRow || storedBillingSubscription.provider === "admin") {
		return false
	}
	if (projection.provider === "admin") {
		return true
	}

	// report two providers' rows, and keep the stored one unless the projected plan ranks higher
	reportError(new Error(`billing subscriptions from two providers for user ${userId}`), "billing", {
		userId,
		currentProvider: storedBillingSubscription.provider,
		currentSubscriptionId: storedBillingSubscription.providerSubscriptionId,
		projectedProvider: projection.provider,
		projectedSubscriptionId: projection.providerSubscriptionId,
	})
	return PLANS[projection.plan].rank <= PLANS[storedBillingSubscription.plan].rank
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
