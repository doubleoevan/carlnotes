// the authorization gate. one isAllowed(userId, capability, topic) call answers every authority and entitlement question.
// an admin bypasses entitlement limits and may view, edit, delete, or scan any topic regardless of owner
import { ADMIN_BUDGET_CENTS, ADMIN_QUOTA, PLANS, type Plan } from "@shared/plans"
import { and, count, eq, gte, inArray, or, sql } from "drizzle-orm"
import { db } from "../db"
import { audienceMembers, billingSubscriptions, scans, subscriptions, topics, users } from "../db/schema"
import { deleteLiteLLMKey, provisionLiteLLMKey } from "./litellm"
import { canRateTopic, canSeeTopic } from "./topic/permissions"
import { scansToday, startOfUtcMonth } from "./topic/quotas"

// the topic fields every resource capability needs: identity, owner, and visibility
type GatedTopic = Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">

// the gated capabilities the isAllowed answers
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type Capability = "topic:view" | "topic:edit" | "topic:delete" | "topic:rate" | "topic:create" | "scan:manual" | "admin:console" | "admin:setRole" | "admin:setBudget"

// a user's authority and entitlement inputs, read together since every gate call needs them
export type UserAccess = { isAdmin: boolean; plan: Plan; budgetOverrideCents: number | null }

/**
 * Whether the user may execute a capability, optionally on a given topic.
 */
export async function isAllowed(userId: string | null, capability: Capability, topic?: GatedTopic): Promise<boolean> {
	// rating is a subscriber action, not an admin power, so it skips the admin override and uses the topic rule
	if (capability === "topic:rate") {
		return topic ? canRateTopic(userId, topic) : false
	}

	// resolve access authority. an admin passes every entitlement and overrides topic view/edit/delete/scan authority
	const access = userId ? await loadUserAccess(userId) : null
	if (access?.isAdmin) {
		return true
	}

	// a non-admin (or signed-out visitor) answers each capability from ownership, subscription, or plan
	switch (capability) {
		// admin-only capabilities already returned true above for an admin, so a non-admin is refused
		case "admin:console":
		case "admin:setRole":
		case "admin:setBudget":
			return false
		// viewing follows the topic's visibility, invite, and subscription rules
		case "topic:view":
			return topic ? canSeeTopic(userId, topic) : false
		// only the owner may edit or delete. the admin override is already returned above
		case "topic:edit":
		case "topic:delete":
			return Boolean(userId) && topic?.ownerId === userId
		// creating a topic is gated by the plan's topic cap
		case "topic:create":
			return userId ? (await ownerTopicCount(userId)) < PLANS[access?.plan ?? "free"].topicLimit : false
		// a manual scan needs the owner to be within their daily quota
		case "scan:manual":
			return userId && topic ? (await authorizeManualScan(userId, topic)).status === "allowed" : false
		// a new capability fails to compile here
		default:
			return assertNever(capability)
	}
}

/**
 * This user's admin status, billing plan, and budget override, read together since the gate needs all three.
 */
export async function loadUserAccess(userId: string): Promise<UserAccess> {
	const [user] = await db
		.select({ role: users.role, plan: users.plan, budgetOverrideCents: users.budgetOverrideCents })
		.from(users)
		.where(eq(users.id, userId))
	return {
		isAdmin: isAdminRole(user?.role),
		plan: user?.plan ?? "free",
		budgetOverrideCents: user?.budgetOverrideCents ?? null,
	}
}

/**
 * Whether a stored role string grants admin authority.
 */
export function isAdminRole(role: string | undefined): boolean {
	// the one place this role decides authority. it stays plain text to match Better Auth's admin plugin shape
	return role === "admin"
}

/**
 * The user's effective monthly budget in cents: their per-user override, otherwise the admin backstop, otherwise the plan's.
 */
export function effectiveBudgetCents({
	isAdmin,
	plan,
	budgetOverrideCents,
}: Pick<UserAccess, "isAdmin" | "plan" | "budgetOverrideCents">): number {
	// an override is deliberate, so it wins even for an admin. that is the only way to guarantee a cap
	return budgetOverrideCents ?? (isAdmin ? ADMIN_BUDGET_CENTS : PLANS[plan].monthlyBudgetCents)
}

/**
 * Whether the user has spent their monthly budget, so the proxy would refuse the model calls a scan makes.
 */
export async function isMonthlySpendExhausted(userId: string): Promise<boolean> {
	// the app's own recorded scan spend, not the proxy's authoritative figure.
	// the topic page polls this while a scan runs, so it stays a local sum rather than repeated round trips to litellm
	const [access, [spendRow]] = await Promise.all([
		loadUserAccess(userId),
		db
			.select({ dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.where(and(eq(scans.ownerId, userId), gte(scans.startedAt, startOfUtcMonth(new Date())))),
	])
	return Math.round(Number(spendRow?.dollars ?? 0) * 100) >= effectiveBudgetCents(access)
}

/**
 * Replace the user's LiteLLM key with a fresh one at their current effective budget,
 * after any update that changes it: a plan change, a role change, or a budget override.
 */
export async function replaceUserLiteLLMKey(userId: string): Promise<void> {
	// read the access the budget derives from, plus the email the new key is aliased to and the key it replaces
	const [access, [user]] = await Promise.all([
		loadUserAccess(userId),
		db
			.select({ email: users.email, litellmVirtualKey: users.litellmVirtualKey })
			.from(users)
			.where(eq(users.id, userId)),
	])

	// a user whose key was never minted has nothing to replace
	if (!user?.litellmVirtualKey) {
		return
	}

	// a new key starts its spend at zero, so its new limit is whole from the moment it applies
	// minting comes first, so a proxy failure leaves the old key in place instead of none
	try {
		const replacementKey = await provisionLiteLLMKey(user.email, effectiveBudgetCents(access))
		try {
			await db.update(users).set({ litellmVirtualKey: replacementKey }).where(eq(users.id, userId))
		} catch (error) {
			// if the db never learned the new key's name, it would sit on the proxy unreferenced forever unless it's deleted
			await deleteLiteLLMKey(replacementKey)
			throw error
		}
		await deleteLiteLLMKey(user.litellmVirtualKey)
	} catch (error) {
		// the proxy is not the source of truth here, so an error must not fail the update that triggered this
		console.error(`litellm key replace failed for user ${userId}`, error)
	}
}

/**
 * The number of remaining topics the user may create under the topic cap, floored at zero. Admins see the unlimited marker.
 * The cap counts the topics they own, so deleting one frees up a slot.
 */
export async function topicsRemaining(userId: string): Promise<number> {
	// admins bypass the topic cap so they can test freely
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// count every topic the user owns against their plan's cap
	return Math.max(0, PLANS[plan].topicLimit - (await ownerTopicCount(userId)))
}

/**
 * The topic ids among the given set that the user is actively subscribed to, directly or through an audience membership.
 * One query resolves every topic at once, so the feed never checks per topic.
 */
export async function subscribedTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
	// an empty id list matches nothing, so skip the query
	if (topicIds.length === 0) {
		return new Set()
	}

	// the audiences the user belongs to, for the audience subscription path
	const memberAudiences = db
		.select({ audienceId: audienceMembers.audienceId })
		.from(audienceMembers)
		.where(eq(audienceMembers.userId, userId))

	// the actively subscribed topics among the given ids, reached directly or through one of those audiences
	const subscriptionRows = await db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(
			and(
				inArray(subscriptions.topicId, topicIds),
				or(eq(subscriptions.subscriberUserId, userId), inArray(subscriptions.subscriberAudienceId, memberAudiences)),
				eq(subscriptions.isActive, true),
			),
		)
	return new Set(subscriptionRows.map((subscriptionRow) => subscriptionRow.topicId))
}

// the outcome of a manual-scan authorization. isOverage marks that an allowed scan is past the daily limit, which the caller bills as one metered unit
export type ManualScanAuthorization =
	| { status: "forbidden" }
	| { status: "quota" }
	| { status: "allowed"; remaining: number; isOverage: boolean }

/**
 * Whether the user may run a manual scan on the topic right now.
 * A payment method makes that limit soft, with extra scans billed as overage.
 * An owner or an admin may scan. An owner checks the daily limit. Admins bypass the limit.
 */
export async function authorizeManualScan(userId: string, topic: GatedTopic): Promise<ManualScanAuthorization> {
	// load the user's access, today's scan count, and whether they can be billed, then apply the decision
	const access = await loadUserAccess(userId)
	const [scansUsedToday, hasPaymentMethod] = await Promise.all([scansToday(userId), loadHasPaymentMethod(userId)])
	return decideManualScan({
		isAdmin: access.isAdmin,
		plan: access.plan,
		isOwner: topic.ownerId === userId,
		scansUsedToday,
		hasPaymentMethod,
	})
}

/**
 * Whether the user has a payment method on file, meaning an active billing subscription that Stripe can charge.
 * A payment method makes the daily scan limit soft.
 */
export async function loadHasPaymentMethod(userId: string): Promise<boolean> {
	const [subscriptionRow] = await db
		.select({ hasPaymentMethod: billingSubscriptions.hasPaymentMethod })
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.userId, userId))
	return subscriptionRow?.hasPaymentMethod ?? false
}

/**
 * The manual-scan decision, applied to values the caller already loaded.
 * A payment method makes that limit soft, with extra scans billed as overage.
 * An owner or an admin may scan. An owner checks the daily limit. Admins bypass the limit.
 */
export function decideManualScan({
	isAdmin,
	plan,
	isOwner,
	scansUsedToday,
	hasPaymentMethod,
}: {
	isAdmin: boolean
	plan: Plan
	isOwner: boolean
	scansUsedToday: number
	hasPaymentMethod: boolean
}): ManualScanAuthorization {
	// only the owner or an admin may run a manual scan on the topic
	if (!isAdmin && !isOwner) {
		return { status: "forbidden" }
	}

	// an admin bypasses the daily scan limit entirely
	if (isAdmin) {
		return { status: "allowed", remaining: ADMIN_QUOTA, isOverage: false }
	}

	// at or past the daily scan limit, a payment method allows the scan as billed overage.
	// no payment method is a hard cap
	const { dailyScanLimit } = PLANS[plan]
	if (scansUsedToday >= dailyScanLimit) {
		return hasPaymentMethod ? { status: "allowed", remaining: 0, isOverage: true } : { status: "quota" }
	}
	return { status: "allowed", remaining: dailyScanLimit - scansUsedToday - 1, isOverage: false }
}

// how many topics the user owns
async function ownerTopicCount(userId: string): Promise<number> {
	const [topicCountRow] = await db.select({ count: count() }).from(topics).where(eq(topics.ownerId, userId))
	return topicCountRow?.count ?? 0
}

// a compile-time error check for a capability case that doesn't have a handler
function assertNever(value: never): never {
	throw new Error(`unhandled capability: ${value}`)
}
