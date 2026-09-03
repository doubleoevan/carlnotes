// the authorization gate
import { dailyFrequencies } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { ADMIN_BUDGET_CENTS, ADMIN_QUOTA, type BillingInterval, PLANS, type Plan } from "@shared/plans"
import { and, count, eq, gte, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { chatTurns, scans, subscriptions, teamMembers, teamTopics, topics, users } from "../db/schema"
import { deleteLiteLLMKey, provisionLiteLLMKey } from "./litellm"
import { assertNever, canRateTopic, canSeeTopic, toTopicEditRole } from "./topic/permissions"
import { loadBillingAccess, scansToday, startOfUtcMonth } from "./topic/quotas"

// the topic fields that every resource capability needs: identity, owner, visibility, and the team that owns it
type GatedTopic = Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId">

// the gated capabilities that "isAllowed" decides
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type Capability = "topic:view" | "topic:edit" | "topic:delete" | "topic:invite" | "topic:rate" | "topic:create" | "scan:request" | "scan:manual" | "chat:send" | "chat:persist" | "admin:console" | "admin:setRole" | "admin:setBudget" | "admin:setFeatureOrder" | "admin:deleteUser"

// a user's authority and entitlement inputs, read together
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
	const userAccess = userId ? await loadUserAccess(userId) : null
	if (userAccess?.isAdmin) {
		return true
	}

	// the chat capabilities check the sign-in status, the topic's visibility, and the user's budget
	if (capability === "chat:send" || capability === "chat:persist") {
		return decideChat(userId, capability, topic)
	}

	// everything else checks ownership, subscription, or plan
	return decideTopicCapability(userId, capability, userAccess?.plan ?? "free", topic)
}

// the per-capability decisions for a non-admin or a signed-out visitor
async function decideTopicCapability(
	userId: string | null,
	capability: Exclude<Capability, "topic:rate" | "chat:send" | "chat:persist">,
	plan: Plan,
	topic?: GatedTopic,
): Promise<boolean> {
	switch (capability) {
		// admin-only capabilities already returned true above for an admin, so a non-admin is rejected
		case "admin:console":
		case "admin:setRole":
		case "admin:setBudget":
		case "admin:setFeatureOrder":
		case "admin:deleteUser":
			return false
		// viewing follows the topic's visibility, invite, and subscription rules
		case "topic:view":
			return topic ? canSeeTopic(userId, topic) : false
		// the topic owner and the owning team's members, while the owner is still on it
		case "topic:edit":
			return topic ? (await toTopicEditRole(userId, topic)) !== null : false
		// only the topic owner may delete
		case "topic:delete":
			return Boolean(userId) && topic?.ownerId === userId
		// only the topic owner can manage the invite list
		case "topic:invite":
			return Boolean(userId) && topic?.ownerId === userId
		// creating a topic is gated by the plan's topic limit
		case "topic:create":
			return userId ? (await ownerTopicCount(userId)) < PLANS[plan].topicLimit : false
		// requesting a manual scan is topic owner only, checked without reading any quota
		case "scan:request":
			return Boolean(userId) && topic?.ownerId === userId
		// a manual scan needs the owner to be within their daily quota
		case "scan:manual":
			return userId && topic ? (await loadManualScanAuthorization(userId, topic)).status === "allowed" : false
		// a new capability fails to compile here
		default:
			return assertNever(capability)
	}
}

/**
 * This user's admin status, billing plan, and budget override, read together.
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
 * Whether a team membership row's role grants team leader authority.
 */
export function isLeaderRole(role: "leader" | "member"): boolean {
	return role === "leader"
}

/**
 * The user's effective monthly budget in cents: their per-user override, otherwise the admin backstop, otherwise the plan's.
 */
export function effectiveBudgetCents({
	isAdmin,
	plan,
	budgetOverrideCents,
}: Pick<UserAccess, "isAdmin" | "plan" | "budgetOverrideCents">): number {
	// an override is deliberate, so it wins even for an admin. that is the only way to guarantee a limit
	return budgetOverrideCents ?? (isAdmin ? ADMIN_BUDGET_CENTS : PLANS[plan].monthlyBudgetCents)
}

/**
 * Whether the user has spent their monthly budget, so the proxy would reject the model calls a scan or a chat turn makes.
 */
export async function isMonthlySpendExhausted(userId: string): Promise<boolean> {
	// scans and chat draw from one budget pool, so both are summed against the same budget
	const [userAccess, spend] = await Promise.all([loadUserAccess(userId), monthlySpendDollars(userId)])
	const spentCents = Math.round(spend.scanDollars * 100) + Math.round(spend.chatDollars * 100)
	return spentCents >= effectiveBudgetCents(userAccess)
}

/**
 * This month's recorded spend for the user, split into scans and chat buckets
 */
export async function monthlySpendDollars(userId: string): Promise<{ scanDollars: number; chatDollars: number }> {
	// both sums use the same UTC month boundary the budget resets on
	const monthStart = startOfUtcMonth(new Date())
	const [[scanRow], [chatRow]] = await Promise.all([
		db
			.select({ dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.where(and(eq(scans.ownerId, userId), gte(scans.startedAt, monthStart))),
		db
			.select({ dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			.where(and(eq(chatTurns.userId, userId), gte(chatTurns.createdAt, monthStart))),
	])
	return { scanDollars: Number(scanRow?.dollars ?? 0), chatDollars: Number(chatRow?.dollars ?? 0) }
}

/**
 * Replace the user's LiteLLM key with a fresh one at their current effective budget,
 * after any update that changes it: a plan change, a role change, or a budget override.
 */
export async function replaceUserLiteLLMKey(userId: string): Promise<boolean> {
	// read the access the budget derives from, plus the email the new key is aliased to and the key it replaces
	const [userAccess, [user]] = await Promise.all([
		loadUserAccess(userId),
		db
			.select({ email: users.email, litellmVirtualKey: users.litellmVirtualKey })
			.from(users)
			.where(eq(users.id, userId)),
	])

	// a user whose key was never created has nothing to replace or update
	if (!user?.litellmVirtualKey) {
		return true
	}

	// a new key starts its spend at zero, so the full new limit is available from the moment it applies
	try {
		const replacementKey = await provisionLiteLLMKey(user.email, effectiveBudgetCents(userAccess))
		try {
			await db.update(users).set({ litellmVirtualKey: replacementKey }).where(eq(users.id, userId))
		} catch (error) {
			// the db update failed to store the new key, so delete it from the proxy
			await deleteLiteLLMKey(replacementKey)
			throw error
		}
		await deleteLiteLLMKey(user.litellmVirtualKey)
		return true
	} catch (error) {
		// the proxy is not the source of truth here, so an error must not fail the update that triggered this.
		// the key stays sized to the old budget and returns false to the caller.
		console.error(`litellm key replace failed for user ${userId}`, error)
		reportError(error, "chat", { userId, budgetCents: String(effectiveBudgetCents(userAccess)) })
		return false
	}
}

/**
 * The plan's topic limit for this user, which a page subtracts what used from, to display how many topics they have left to add.
 */
export async function topicLimit(userId: string): Promise<number> {
	const { isAdmin, plan } = await loadUserAccess(userId)
	return isAdmin ? ADMIN_QUOTA : PLANS[plan].topicLimit
}

/**
 * The number of remaining topics the user may create under the topic limit, floored at zero. Admins see the unlimited marker.
 * The limit counts the topics they own, so deleting one frees up a slot.
 */
export async function topicsRemaining(userId: string): Promise<number> {
	// admins bypass the topic limit so they can test freely
	const { isAdmin, plan } = await loadUserAccess(userId)
	if (isAdmin) {
		return ADMIN_QUOTA
	}

	// count every topic the user owns against their plan's limit
	return Math.max(0, PLANS[plan].topicLimit - (await ownerTopicCount(userId)))
}

/**
 * How many topics the plan allows on a daily frequency, and how many slots are still free
 * Admins get unlimited topics. A topic moved off a daily frequency gives the user their slot back.
 */
export async function loadDailyTopicQuota(userId: string): Promise<{ limit: number; remainingTopics: number }> {
	// admins bypass the daily topic limit, as they do every other quota
	const [userAccess, { billingInterval }] = await Promise.all([loadUserAccess(userId), loadBillingAccess(userId)])
	if (userAccess.isAdmin) {
		return { limit: ADMIN_QUOTA, remainingTopics: ADMIN_QUOTA }
	}

	// what the plan allows at the user's billing interval, less the topics already on a daily frequency
	const limit = PLANS[userAccess.plan].dailyTopicLimit[billingInterval]
	return { limit, remainingTopics: Math.max(0, limit - (await dailyTopicCount(userId))) }
}

/**
 * The topic ids among the given set that the user is actively subscribed to.
 * One query resolves every topic at once, so the feed never checks per topic.
 */
export async function subscribedTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
	// an empty id list matches nothing, so skip the query
	if (topicIds.length === 0) {
		return new Set()
	}

	// the actively subscribed topics among the given ids
	const subscriptionRows = await db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(
			and(
				inArray(subscriptions.topicId, topicIds),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
	return new Set(subscriptionRows.map((subscriptionRow) => subscriptionRow.topicId))
}

/**
 * The topic ids among the given set the user reaches through team membership.
 * Two queries resolve every topic at once, the same shape as subscribedTopicIds.
 */
export async function memberTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
	// an empty id list matches nothing, so skip the query
	if (topicIds.length === 0) {
		return new Set()
	}

	// the topics held by a team the user belongs to: through topics.teamId or a teamTopics share
	const [memberRows, sharedRows] = await Promise.all([
		db
			.select({ topicId: topics.id })
			.from(topics)
			.innerJoin(teamMembers, and(eq(teamMembers.teamId, topics.teamId), eq(teamMembers.isActive, true)))
			.where(and(inArray(topics.id, topicIds), eq(teamMembers.userId, userId))),
		db
			.select({ topicId: teamTopics.topicId })
			.from(teamTopics)
			.innerJoin(teamMembers, and(eq(teamMembers.teamId, teamTopics.teamId), eq(teamMembers.isActive, true)))
			.where(and(inArray(teamTopics.topicId, topicIds), eq(teamMembers.userId, userId))),
	])
	return new Set([...memberRows, ...sharedRows].map((topicRow) => topicRow.topicId))
}

// the outcome of a manual-scan authorization
export type ManualScanAuthorization =
	| { status: "forbidden" }
	| { status: "quota" }
	| { status: "allowed"; remainingScans: number; isOverage: boolean }

/**
 * Whether the user may run a manual scan on the topic right now.
 * An owner checks the daily limit, which a payment method makes soft with extra scans billed as overage.
 * Admins bypass the limit.
 */
export async function loadManualScanAuthorization(userId: string, topic: GatedTopic): Promise<ManualScanAuthorization> {
	// load the user's access, today's scan count, and whether they can be billed, then authorize
	const userAccess = await loadUserAccess(userId)
	const [scansUsedToday, billingAccess] = await Promise.all([scansToday(userId), loadBillingAccess(userId)])
	return authorizeManualScan({
		isAdmin: userAccess.isAdmin,
		plan: userAccess.plan,
		isTopicOwner: topic.ownerId === userId,
		scansUsedToday,
		...billingAccess,
	})
}

// the outcome of a daily-frequency authorization. a rejection includes the limit, so the message can show the number
export type DailyFrequencyAuthorization = { status: "allowed" } | { status: "quota"; limit: number }

/**
 * Whether the user may put one more topic on a daily frequency, based on their plan's daily topic limit.
 */
export async function loadDailyFrequencyAuthorization(userId: string): Promise<DailyFrequencyAuthorization> {
	const [userAccess, { billingInterval }, dailyTopicsUsed] = await Promise.all([
		loadUserAccess(userId),
		loadBillingAccess(userId),
		dailyTopicCount(userId),
	])
	return authorizeDailyFrequency({
		isAdmin: userAccess.isAdmin,
		plan: userAccess.plan,
		billingInterval,
		dailyTopicsUsed,
	})
		? { status: "allowed" }
		: { status: "quota", limit: PLANS[userAccess.plan].dailyTopicLimit[billingInterval] }
}

/**
 * Whether one more daily-frequency topic is allowed.
 * An admin bypasses the limit. Everyone else fits under their plan's limit for their billing interval.
 */
export function authorizeDailyFrequency({
	isAdmin,
	plan,
	billingInterval,
	dailyTopicsUsed,
}: {
	isAdmin: boolean
	plan: Plan
	billingInterval: BillingInterval
	dailyTopicsUsed: number
}): boolean {
	return isAdmin || dailyTopicsUsed < PLANS[plan].dailyTopicLimit[billingInterval]
}

/**
 * Whether a manual scan is allowed, from values the caller already loaded.
 * An owner or an admin may scan. An owner checks the daily limit, which a payment method makes soft
 * with extra scans billed as overage. Admins bypass the limit.
 */
export function authorizeManualScan({
	isAdmin,
	plan,
	isTopicOwner,
	scansUsedToday,
	hasPaymentMethod,
	billingInterval,
}: {
	isAdmin: boolean
	plan: Plan
	isTopicOwner: boolean
	scansUsedToday: number
	hasPaymentMethod: boolean
	// how the subscription bills: monthly or yearly
	billingInterval: BillingInterval
}): ManualScanAuthorization {
	// only the owner or an admin may run a manual scan on the topic
	if (!isAdmin && !isTopicOwner) {
		return { status: "forbidden" }
	}

	// an admin bypasses the daily scan limit entirely
	if (isAdmin) {
		return { status: "allowed", remainingScans: ADMIN_QUOTA, isOverage: false }
	}

	// at or past the daily scan limit, a payment method on a monthly subscription allows the scan as billed overage
	const dailyScanLimit = PLANS[plan].dailyScanLimit[billingInterval]
	if (scansUsedToday >= dailyScanLimit) {
		const isBillable = hasPaymentMethod && billingInterval === "monthly"
		return isBillable ? { status: "allowed", remainingScans: 0, isOverage: true } : { status: "quota" }
	}
	return { status: "allowed", remainingScans: dailyScanLimit - scansUsedToday - 1, isOverage: false }
}

// every chat capability needs a signed-in user. sending a chat needs a visible topic and budget left
async function decideChat(
	userId: string | null,
	capability: "chat:send" | "chat:persist",
	topic?: GatedTopic,
): Promise<boolean> {
	// a signed-out visitor gets no capabilities
	if (!userId) {
		return false
	}

	// saving history requires an account
	if (capability === "chat:persist") {
		return true
	}

	// sending checks visibility and budget
	if (!topic || !(await canSeeTopic(userId, topic))) {
		return false
	}
	return !(await isMonthlySpendExhausted(userId))
}

// how many topics the user owns
async function ownerTopicCount(userId: string): Promise<number> {
	const [topicCountRow] = await db.select({ count: count() }).from(topics).where(eq(topics.ownerId, userId))
	return topicCountRow?.count ?? 0
}

// how many topics the user has on a daily frequency
async function dailyTopicCount(userId: string): Promise<number> {
	const [topicCountRow] = await db
		.select({ count: count() })
		.from(topics)
		.where(and(eq(topics.ownerId, userId), inArray(topics.frequency, [...dailyFrequencies])))
	return topicCountRow?.count ?? 0
}
