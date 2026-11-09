// the authorization gate
import { dailyFrequencies } from "@carlnotes/contracts/enums"
import {
	ADMIN_QUOTA,
	type BillingInterval,
	isOverageBillable,
	type MonthlyBudgetCutoffKind,
	type OverageBillingAccess,
	PLANS,
	type Plan,
	userBudgetCents,
	userTopicLimit,
} from "@carlnotes/contracts/plans"
import { and, count, eq, inArray } from "drizzle-orm"
import { hasUserBlockBetween } from "./contentFilters"
import { canRateTopic } from "./findingPermissions"
import { type DbHandle, db } from "./index"
import { isMonthlyBudgetCutoffPassed } from "./monthlyBudgetCutoffs"
import {
	decidePersonalSourcesCapability,
	hasUnconvertedPersonalSources,
	type PersonalSourcesCapability,
} from "./personalSourcesAuthority"
import {
	hasFullPodcastEpisodes,
	loadBillingAccess,
	loadTopicImageRegenerationQuota,
	loadUserAccess,
	monthlySpendDollars,
	scansToday,
	toSpendCents,
} from "./quotas"
import { topics } from "./schema/topics"
import { assertNever, canRequestTopicScan, canSeeTopic, toTopicEditRole } from "./topicPermissions"

// collection grants share the Topic permission loaders
export { loadSubscribedTopicIds as subscribedTopicIds, memberTopicIds } from "./topicPermissions"

// the topic fields that every resource capability needs: identity, owner, visibility, and the team that owns it
type GatedTopic = Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId">

// the gated capabilities that "isAllowed" decides
export type Capability =
	| PersonalSourcesCapability
	// a topic: viewing, editing, deleting, inviting, and seeing its costs and failure reasons
	| "topic:view"
	| "topic:edit"
	| "topic:delete"
	| "topic:invite"
	| "topic:viewOwnerDetails"
	// rating and creating a topic, and its scans
	| "topic:rate"
	| "topic:create"
	| "scan:request"
	| "scan:manual"
	// chat, and a topic's podcast episodes
	| "chat:send"
	| "chat:persist"
	| "podcastEpisode:full"
	| "podcastEpisode:remove"
	// regenerating a topic's image, within the owner's monthly plan limit
	| "topicImage:regenerate"
	// reactions and comments: posting one, and deleting anyone's on the topic's social targets
	| "social:post"
	| "social:moderate"
	// the admin console
	| "admin:console"
	| "admin:setRole"
	| "admin:setBudget"
	| "admin:setHomeOrder"
	| "admin:deleteUser"
	| "admin:setAdminBlock"

// the user's budget and the role helpers live in contracts, where the worker can read them
export { isAdminRole, isLeaderRole } from "@carlnotes/contracts/enums"
export { userBudgetCents } from "@carlnotes/contracts/plans"

// the user's access row and the month's spend, from the loaders that the api shares with the worker
export { loadUserAccess, monthlySpendDollars }

/**
 * Whether the user may execute a capability, optionally on a given topic.
 */
export async function isAllowed(userId: string | null, capability: Capability, topic?: GatedTopic): Promise<boolean> {
	// private confirmation authority belongs to its owner before administrative entitlements apply
	if (isPersonalSourcesCapability(capability)) {
		return decidePersonalSourcesCapability({ userId, capability, topic })
	}

	// a private Topic with personal sources still to convert stays closed to everyone the restriction names
	if (
		topic?.visibility === "private" &&
		isPersonalSourcesRestrictedCapability({ userId, capability, topic }) &&
		(await hasUnconvertedPersonalSources(topic.id))
	) {
		return false
	}
	// rating is a subscriber action, not an admin power, so it skips the admin override and uses the topic rule
	if (capability === "topic:rate") {
		return topic ? canRateTopic(userId, topic) : false
	}

	// Scan workers can use the same authority through their transaction
	if (capability === "scan:request") {
		return canRequestTopicScan(userId, topic)
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

	// a post needs a signed-in user who can see the topic, is under no admin block, and is in no user block with its owner
	if (capability === "social:post") {
		return userId && topic ? canPostOnTopic(userId, topic) : false
	}

	// everything else checks ownership, subscription, or plan
	return decideTopicCapability(userId, capability, topic)
}

// the per-capability decisions for a non-admin or a signed-out visitor
async function decideTopicCapability(
	userId: string | null,
	capability: Exclude<
		Capability,
		PersonalSourcesCapability | "topic:rate" | "chat:send" | "chat:persist" | "scan:request" | "social:post"
	>,
	topic?: GatedTopic,
): Promise<boolean> {
	switch (capability) {
		// admin-only capabilities already returned true above for an admin, so a non-admin is rejected
		case "admin:console":
		case "admin:setRole":
		case "admin:setBudget":
		case "admin:setHomeOrder":
		case "admin:deleteUser":
		case "admin:setAdminBlock":
			return false
		// viewing follows the topic's visibility, invite, and subscription rules
		case "topic:view":
			return topic ? canSeeTopic(userId, topic) : false
		// the topic owner and the owning team's members, while the owner is still on it
		case "topic:edit":
			return topic ? (await toTopicEditRole(userId, topic)) !== null : false
		// only the topic owner may delete the topic, manage its invite list, see its costs, failure reasons, and generated
		// context, or remove one of its podcast episodes
		case "topic:delete":
		case "topic:invite":
		case "topic:viewOwnerDetails":
		case "podcastEpisode:remove":
		case "social:moderate":
			return Boolean(userId) && topic?.ownerId === userId
		// creating a topic is gated by the plan's topic limit
		case "topic:create":
			return userId ? (await ownerTopicCount(userId)) < (await topicLimit(userId)) : false
		// a manual scan needs the owner to be within their daily quota
		case "scan:manual":
			return userId && topic ? (await loadManualScanAuthorization(userId, topic)).status === "allowed" : false
		// an admin or a paid plan gets full podcast episodes, and the free plan gets short podcast episodes.
		// the admin role and the plan are the topic owner's
		case "podcastEpisode:full":
			return topic ? hasFullPodcastEpisodes(topic.ownerId) : false
		// a regeneration needs regenerations left in the owner's month
		case "topicImage:regenerate":
			return userId ? (await loadTopicImageRegenerationQuota(userId)).remaining > 0 : false
		// a new capability fails to compile here
		default:
			return assertNever(capability)
	}
}

// whether a user who is not an admin may post a reaction or a comment on one of a topic's social targets
async function canPostOnTopic(userId: string, topic: GatedTopic): Promise<boolean> {
	// an admin block stops every post, and so does a user block between the user and the topic's owner
	const { isAdminBlocked } = await loadUserAccess(userId)
	if (isAdminBlocked || !(await canSeeTopic(userId, topic))) {
		return false
	}
	return topic.ownerId === userId || !(await hasUserBlockBetween(userId, topic.ownerId))
}

// personal sources capabilities are decided before the general admin override
function isPersonalSourcesCapability(capability: Capability): capability is PersonalSourcesCapability {
	return capability.startsWith("personalSources:")
}

// moderation deletion remains possible without exposing private derived content or inviting new readers
function isPersonalSourcesRestrictedCapability({
	userId,
	capability,
	topic,
}: {
	userId: string | null
	capability: Capability
	topic: GatedTopic
}): boolean {
	// an invite is restricted for everyone, and a read, a chat, or a post for everyone but the owner
	if (capability === "topic:invite") {
		return true
	}
	return (
		topic.ownerId !== userId &&
		["topic:view", "topic:viewOwnerDetails", "chat:send", "social:post"].includes(capability)
	)
}

/**
 * Whether the user has spent their monthly budget, so the proxy would reject the model calls a scan or a chat turn makes.
 */
export async function isMonthlySpendExhausted(userId: string): Promise<boolean> {
	// sum the scan, chat, and podcast episode spend against the user's one budget
	const [userAccess, monthlySpend] = await Promise.all([loadUserAccess(userId), monthlySpendDollars(userId)])
	return toSpendCents(monthlySpend) >= userBudgetCents(userAccess)
}

/**
 * Returns the user's spend status for this cutoff kind: budget, paused, or allowed.
 */
export async function loadMonthlyBudgetCutoffStatus(
	userId: string,
	kind: MonthlyBudgetCutoffKind,
): Promise<"budget" | "paused" | "allowed"> {
	// start both checks together. each reads the user's access row and the month's spend, which load once per request
	const [isSpendExhausted, isCutoffPassed] = await Promise.all([
		isMonthlySpendExhausted(userId),
		isMonthlyBudgetCutoffPassed(userId, kind),
	])

	// a spent budget comes first, then a passed cutoff
	if (isSpendExhausted) {
		return "budget"
	}
	return isCutoffPassed ? "paused" : "allowed"
}

/**
 * The plan's topic limit for this user, which a page subtracts what used from, to display how many topics they have left to add.
 */
export async function topicLimit(userId: string): Promise<number> {
	const access = await loadUserAccess(userId)
	return access.isAdmin ? ADMIN_QUOTA : userTopicLimit(access)
}

/**
 * The number of remaining topics the user may create under the topic limit, floored at zero. Admins see the unlimited marker.
 * The limit counts the topics they own, so deleting one frees up a slot.
 */
export async function topicsRemaining(userId: string, handle?: DbHandle): Promise<number> {
	// admins bypass the topic limit so they can test freely
	const access = await loadUserAccess(userId, handle)
	if (access.isAdmin) {
		return ADMIN_QUOTA
	}

	// count every topic the user owns against their plan's limit
	return Math.max(0, userTopicLimit(access) - (await ownerTopicCount(userId, handle)))
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

// the outcome of a manual-scan authorization
export type ManualScanAuthorization =
	| { status: "forbidden" }
	| { status: "quota" }
	| { status: "allowed"; remainingScans: number; isOverage: boolean }

/**
 * Whether the user may run a manual scan on the topic right now.
 * An owner checks the daily limit, which a monthly Stripe subscription with a card makes soft with extra scans billed
 * as overage.
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
export async function loadDailyFrequencyAuthorization(
	userId: string,
	handle?: DbHandle,
): Promise<DailyFrequencyAuthorization> {
	const [userAccess, { billingInterval }, dailyTopicsUsed] = await Promise.all([
		loadUserAccess(userId, handle),
		loadBillingAccess(userId, handle),
		dailyTopicCount(userId, handle),
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
 * An owner or an admin may scan. An owner checks the daily limit, which a monthly Stripe subscription with a card makes
 * soft with extra scans billed as overage. Admins bypass the limit.
 */
export function authorizeManualScan({
	isAdmin,
	plan,
	isTopicOwner,
	scansUsedToday,
	...billingAccess
}: OverageBillingAccess & {
	isAdmin: boolean
	plan: Plan
	isTopicOwner: boolean
	scansUsedToday: number
}): ManualScanAuthorization {
	// only the owner or an admin may run a manual scan on the topic
	if (!isAdmin && !isTopicOwner) {
		return { status: "forbidden" }
	}

	// an admin bypasses the daily scan limit entirely
	if (isAdmin) {
		return { status: "allowed", remainingScans: ADMIN_QUOTA, isOverage: false }
	}

	// at or past the daily scan limit, a subscription that bills overage allows the scan as billed overage
	const dailyScanLimit = PLANS[plan].dailyScanLimit[billingAccess.billingInterval]
	if (scansUsedToday >= dailyScanLimit) {
		return isOverageBillable(billingAccess)
			? { status: "allowed", remainingScans: 0, isOverage: true }
			: { status: "quota" }
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
async function ownerTopicCount(userId: string, handle: DbHandle = db): Promise<number> {
	const [topicCountRow] = await handle.select({ count: count() }).from(topics).where(eq(topics.ownerId, userId))
	return topicCountRow?.count ?? 0
}

// how many topics the user has on a daily frequency
async function dailyTopicCount(userId: string, handle: DbHandle = db): Promise<number> {
	const [topicCountRow] = await handle
		.select({ count: count() })
		.from(topics)
		.where(and(eq(topics.ownerId, userId), inArray(topics.frequency, [...dailyFrequencies])))
	return topicCountRow?.count ?? 0
}
