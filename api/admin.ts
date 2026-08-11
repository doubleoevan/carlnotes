// the admin console data: a per-user table of standing and cost, and platform totals with a contribution figure.
// storage is attributed over globally-deduplicated Resources, and contribution is net revenue minus tracked cost
import { zValidator } from "@hono/zod-validator"
import type { ActivityTopic, AdminTotals, AdminUserRow } from "@shared/contracts"
import { budgetOverridePayload, setRolePayload } from "@shared/contracts"
import { count, eq, gte, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import {
	attachments,
	chatAttachments,
	chatTurns,
	EMBED_DIMENSIONS,
	findings,
	resources,
	scans,
	topics,
	users,
} from "../db/schema"
import { loadActivity } from "./activity"
import { effectiveBudgetCents, isAdminRole, isAllowed, replaceUserLiteLLMKey } from "./authorization"
import { readStripeTotalRevenueCents } from "./billing"
import { type AppEnv, currentUser } from "./currentUser"
import { readLiteLLMKeySpend } from "./litellm"
import { startOfUtcMonth } from "./topic/quotas"

// the bytes one embedded Resource attributes. a float4 dimension is four bytes wide
const EMBED_BYTES = EMBED_DIMENSIONS * 4

/**
 * A user's owned topics as their own Activity page would show them for the subtable in an admin's users table
 */
export async function loadAdminUserTopics(userId: string): Promise<ActivityTopic[] | null> {
	// the loader keys off the user, so an admin reads exactly what that user reads, with no second query to drift
	const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId))
	if (!user) {
		return null
	}
	return (await loadActivity(user)).topics
}

/**
 * One row per user for the admin table: status, topic count, attributed storage, and month-to-date variable cost against their effective budget.
 */
export async function loadAdminUsers(): Promise<AdminUserRow[]> {
	// the base user rows, the per-user topic counts, the attributed storage, and this month's scan and chat spend,
	// all in parallel and each as one grouped query
	const monthStart = startOfUtcMonth(new Date())
	const [userRows, topicCountRows, storageByUser, scanSpendRows, chatSpendRows] = await Promise.all([
		db
			.select({
				// identity and status
				id: users.id,
				email: users.email,
				username: users.username,
				avatarSource: users.avatarSource,
				role: users.role,
				plan: users.plan,
				// the override, signup time, and the key that bills topic scans
				budgetOverrideCents: users.budgetOverrideCents,
				createdAt: users.createdAt,
				litellmVirtualKey: users.litellmVirtualKey,
			})
			.from(users),
		db.select({ ownerId: topics.ownerId, count: count() }).from(topics).groupBy(topics.ownerId),
		loadAttributedStorage(),
		db
			.select({ ownerId: scans.ownerId, dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.where(gte(scans.startedAt, monthStart))
			.groupBy(scans.ownerId),
		db
			.select({ userId: chatTurns.userId, dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			.where(gte(chatTurns.createdAt, monthStart))
			.groupBy(chatTurns.userId),
	])

	// read each user's observed spend in parallel, best-effort, keyed by user id
	// one proxy call per user, batch this read if the admin page starts dragging
	const userSpends = await Promise.all(
		userRows.map(async (user) => {
			const spendDollars = user.litellmVirtualKey ? await readLiteLLMKeySpend(user.litellmVirtualKey) : null
			return [user.id, spendDollars] as const
		}),
	)
	const spendByUser = new Map(userSpends)
	const topicCountByUser = new Map(topicCountRows.map((topicCountRow) => [topicCountRow.ownerId, topicCountRow.count]))

	// the app's own totals keyed by user, in cents
	const scanSpendByUser = new Map(
		scanSpendRows.map((scanSpendRow) => [scanSpendRow.ownerId, Math.round(Number(scanSpendRow.dollars) * 100)]),
	)
	const chatSpendByUser = new Map(
		chatSpendRows.map((chatSpendRow) => [chatSpendRow.userId, Math.round(Number(chatSpendRow.dollars) * 100)]),
	)

	// assemble each row, converting the observed dollar spend to cents and resolving the effective budget
	return userRows.map((user) => {
		const spendDollars = spendByUser.get(user.id) ?? null
		return {
			// identity and standing
			id: user.id,
			email: user.email,
			username: user.username,
			avatarSource: user.avatarSource,
			role: user.role,
			plan: user.plan,
			createdAt: user.createdAt.toISOString(),
			topicCount: topicCountByUser.get(user.id) ?? 0,
			// the attributed storage, observed monthly cost, the app's own split totals, and budget
			attributedBytes: storageByUser.get(user.id) ?? 0,
			monthVariableCostCents: spendDollars === null ? null : Math.round(spendDollars * 100),
			scanSpendCents: scanSpendByUser.get(user.id) ?? 0,
			chatSpendCents: chatSpendByUser.get(user.id) ?? 0,
			budgetOverrideCents: user.budgetOverrideCents,
			effectiveBudgetCents: effectiveBudgetCents({
				isAdmin: isAdminRole(user.role),
				plan: user.plan,
				budgetOverrideCents: user.budgetOverrideCents,
			}),
		}
	})
}

/**
 * The totals summary from the already-loaded user rows, plus Stripe net revenue and the derived contribution.
 */
export async function loadAdminTotals(userRows: AdminUserRow[]): Promise<AdminTotals> {
	// sum the per-user attributed storage and observed variable cost across the platform
	const attributedBytes = userRows.reduce((sum, userRow) => sum + userRow.attributedBytes, 0)
	const monthVariableCostCents = userRows.reduce((sum, userRow) => sum + (userRow.monthVariableCostCents ?? 0), 0)

	// pull Stripe's netted revenue for the month and derive the contribution, minus an optional flat fixed-cost constant
	const netRevenueCents = await readStripeTotalRevenueCents(Math.floor(startOfUtcMonth(new Date()).getTime() / 1000))
	const fixedMonthlyCostCents = Number(Bun.env.FIXED_MONTHLY_COST_CENTS ?? 0)
	return {
		attributedBytes,
		monthVariableCostCents,
		netRevenueCents,
		contributionCents: computeContributionCents(netRevenueCents, monthVariableCostCents, fixedMonthlyCostCents),
	}
}

/**
 * Contribution in cents: net revenue minus tracked variable cost minus an optional fixed cost. Null when revenue is unavailable.
 */
export function computeContributionCents(
	netRevenueCents: number | null,
	trackedVariableCostCents: number,
	fixedCostCents: number,
): number | null {
	// with no revenue figure, there is nothing to net against, so contribution is unavailable
	if (netRevenueCents === null) {
		return null
	}
	return netRevenueCents - trackedVariableCostCents - fixedCostCents
}

/**
 * Change a user's role. An admin cannot remove their own admin role,
 * so the platform can never get locked out of its last admin.
 */
export async function setUserRole(
	actingUserId: string,
	targetUserId: string,
	role: "admin" | "user",
): Promise<"set" | "selfDemotion" | "missing"> {
	if (isSelfDemotion(actingUserId, targetUserId, role)) {
		return "selfDemotion"
	}

	// the role carries its own spend backstop, so the key follows with the promotion or demotion
	const [updated] = await db.update(users).set({ role }).where(eq(users.id, targetUserId)).returning({ id: users.id })
	if (!updated) {
		return "missing"
	}
	await replaceUserLiteLLMKey(targetUserId)
	return "set"
}

// whether a role change is an admin demoting themselves, the one change setUserRole rejects
export function isSelfDemotion(actingUserId: string, targetUserId: string, role: "admin" | "user"): boolean {
	return actingUserId === targetUserId && role !== "admin"
}

/**
 * Set or clear a user's per-user budget override, then reissue their LiteLLM key at the resulting effective budget.
 * Returns false when no such user exists.
 */
export async function setUserBudgetOverride(
	targetUserId: string,
	budgetOverrideCents: number | null,
): Promise<boolean> {
	// the update reports whether it matched a row, so a made-up user id answers missing instead of ok
	const [updated] = await db
		.update(users)
		.set({ budgetOverrideCents })
		.where(eq(users.id, targetUserId))
		.returning({ id: users.id })
	if (!updated) {
		return false
	}
	// the key is sized to the effective budget, so it follows the override
	await replaceUserLiteLLMKey(targetUserId)
	return true
}

// attributed storage in bytes per user: distinct resource content + embedding bytes + attachment bytes across their topics
async function loadAttributedStorage(): Promise<Map<string, number>> {
	// distinct (owner, resource) pairs so the same Resource in two of a user's topics counts once
	const userResources = db
		.selectDistinct({ userId: topics.ownerId, resourceId: findings.resourceId })
		.from(topics)
		.innerJoin(findings, eq(findings.topicId, topics.id))
		.as("user_resources")

	// content bytes summed per user, and how many of those distinct resources carry an embedding.
	// the inline column is the fallback for a resource stored before content moved to object storage
	const contentRows = await db
		.select({
			userId: userResources.userId,
			contentBytes: sql<number>`coalesce(sum(coalesce(${resources.contentBytes}, octet_length(coalesce(${resources.content}, '')))), 0)`,
			embeddedCount: sql<number>`count(*) filter (where ${resources.embedding} is not null)`,
		})
		.from(userResources)
		.innerJoin(resources, eq(resources.id, userResources.resourceId))
		.groupBy(userResources.userId)

	// attachment bytes across all topics per user
	const attachmentRows = await db
		.select({ userId: topics.ownerId, bytes: sql<number>`coalesce(sum(${attachments.byteSize}), 0)` })
		.from(topics)
		.innerJoin(attachments, eq(attachments.topicId, topics.id))
		.groupBy(topics.ownerId)

	// combine content + embedding + attachment bytes per user. postgres returns the aggregates as strings, so coerce
	const bytesByUser = new Map<string, number>()
	for (const contentRow of contentRows) {
		bytesByUser.set(contentRow.userId, Number(contentRow.contentBytes) + Number(contentRow.embeddedCount) * EMBED_BYTES)
	}

	// add attachment bytes onto each user's running total
	for (const attachmentRow of attachmentRows) {
		bytesByUser.set(attachmentRow.userId, (bytesByUser.get(attachmentRow.userId) ?? 0) + Number(attachmentRow.bytes))
	}

	// kept chat attachments attribute to the user who kept them, not to the topic's owner
	const chatAttachmentRows = await db
		.select({ userId: chatAttachments.userId, bytes: sql<number>`coalesce(sum(${chatAttachments.byteSize}), 0)` })
		.from(chatAttachments)
		.groupBy(chatAttachments.userId)

	// add kept bytes onto each user's running total
	for (const chatAttachmentRow of chatAttachmentRows) {
		bytesByUser.set(
			chatAttachmentRow.userId,
			(bytesByUser.get(chatAttachmentRow.userId) ?? 0) + Number(chatAttachmentRow.bytes),
		)
	}
	return bytesByUser
}

// the admin console routes, each re-checking the role through the gate
export const adminRoute = new Hono<AppEnv>()
	.get("/admin/console", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the users table and the totals summary, admin only.
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const users = await loadAdminUsers()
		const totals = await loadAdminTotals(users)
		return context.json({ users, totals })
	})
	.post("/admin/users/:id/role", zValidator("json", setRolePayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// change a user's role, rejecting an admin's own self-demotion. admin only.
		if (!(await isAllowed(userId, "admin:setRole"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		// each rejection answers in its own terms: a self-demotion is refused, a made-up user id is not found
		const roleResult = await setUserRole(userId, context.req.param("id"), context.req.valid("json").role)
		if (roleResult === "selfDemotion") {
			return context.json({ error: "cannot remove your own admin role" }, 409)
		}
		return roleResult === "set" ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.get("/admin/users/:id/topics", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// one user's owned topics, as the admin console's expandable row shows them, admin only.
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const topics = await loadAdminUserTopics(context.req.param("id"))
		return topics ? context.json({ topics }) : context.json({ error: "not found" }, 404)
	})
	.post("/admin/users/:id/budget", zValidator("json", budgetOverridePayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// set or clear a user's budget override and resize their key to the new effective budget, admin only.
		if (!(await isAllowed(userId, "admin:setBudget"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const isOverrideSet = await setUserBudgetOverride(
			context.req.param("id"),
			context.req.valid("json").budgetOverrideCents,
		)
		return isOverrideSet ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
