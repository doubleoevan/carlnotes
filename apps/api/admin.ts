// the admin writes: a user's role and budget override, and the admin console routes

import { budgetOverridePayload, setRolePayload } from "@carlnotes/contracts/payloads"
import { resolveReportPayload } from "@carlnotes/contracts/reports"
import { db } from "@carlnotes/db"
import { users } from "@carlnotes/db/schema/users"
import { replaceUserLiteLLMKey } from "@carlnotes/models/litellm"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import {
	loadAdminTeamMembers,
	loadAdminTeams,
	loadAdminTopicSubscribers,
	loadAdminTotals,
	loadAdminUsers,
	loadAdminUserTeams,
	loadAdminUserTopics,
} from "./adminConsole"
import { isAdminRole, isAllowed } from "./authorization"
import { type AppEnv, currentUser } from "./currentUser"
import { loadOpenReports, resolveReport } from "./report/adminReports"
import { refreshSessionUser } from "./sessions"
import { loadAdminTeamTopics } from "./team/helpers"

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

	// the role has its own spend backstop, so the litellm key follows with their role change
	const [updated] = await db.update(users).set({ role }).where(eq(users.id, targetUserId)).returning({ id: users.id })
	if (!updated) {
		return "missing"
	}

	// write the role to the user's sessions, then reissue the LiteLLM key for the new role
	await refreshSessionUser(targetUserId)
	await replaceUserLiteLLMKey(targetUserId)
	return "set"
}

// whether a role change is an admin demoting themselves, the one change setUserRole rejects
export function isSelfDemotion(actingUserId: string, targetUserId: string, role: "admin" | "user"): boolean {
	return actingUserId === targetUserId && !isAdminRole(role)
}

/**
 * Set or clear a user's budget override, then reissue their LiteLLM key for the new budget.
 * Returns false if no such user exists.
 */
export async function setUserBudgetOverride(
	targetUserId: string,
	budgetOverrideCents: number | null,
): Promise<"applied" | "key-unchanged" | "missing"> {
	// the update reports whether it matched a row, so a made-up user id returns missing instead of ok
	const [updated] = await db
		.update(users)
		.set({ budgetOverrideCents })
		.where(eq(users.id, targetUserId))
		.returning({ id: users.id })
	if (!updated) {
		return "missing"
	}

	// the key is resized to the budget, which includes the override. the user is notified if the proxy rejected
	return (await replaceUserLiteLLMKey(targetUserId)) ? "applied" : "key-unchanged"
}

// the admin console routes, each re-checking the role through the gate
export const adminRoute = new Hono<AppEnv>()
	.get("/admin/console", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the users table and the totals summary, admin only.
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const users = await loadAdminUsers()
		const [teams, totals] = await Promise.all([loadAdminTeams(), loadAdminTotals(users)])
		return context.json({ users, teams, totals })
	})
	.post("/admin/users/:id/role", zValidator("json", setRolePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// change a user's role, rejecting an admin's own self-demotion. admin only.
		if (!(await isAllowed(userId, "admin:setRole"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		// each rejection gives a reason: a self-demotion is rejected, a made-up user id is not found
		const roleResult = await setUserRole(userId, context.req.param("id"), context.req.valid("json").role)
		if (roleResult === "selfDemotion") {
			return context.json({ error: "cannot remove your own admin role" }, 409)
		}
		return roleResult === "set" ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.get("/admin/users/:id/topics", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// one user's owned topics, as the admin console's expandable row shows them, admin only.
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const topics = await loadAdminUserTopics({ userId: context.req.param("id"), adminUserId: userId })
		return topics ? context.json({ topics }) : context.json({ error: "not found" }, 404)
	})
	.get("/admin/teams/:id/members", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// one team's members, as the admin console's expandable row shows it, admin only
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const members = await loadAdminTeamMembers(context.req.param("id"))
		return members ? context.json({ members }) : context.json({ error: "not found" }, 404)
	})
	.get("/admin/users/:id/teams", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// one user's teams, as the admin console's expandable row shows them, admin only
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const userTeams = await loadAdminUserTeams(context.req.param("id"))
		return userTeams ? context.json({ teams: userTeams }) : context.json({ error: "not found" }, 404)
	})
	.get("/admin/teams/:id/topics", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// one team's topics, as the admin console's expandable row shows them, admin only
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const teamTopics = await loadAdminTeamTopics({ teamId: context.req.param("id"), adminUserId: userId })
		return teamTopics ? context.json({ topics: teamTopics }) : context.json({ error: "not found" }, 404)
	})
	.get("/admin/topics/:id/subscribers", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// one topic's subscribers, as the admin console's topics subtable shows them, admin only
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		// the topic's subscribers, or 404 for a missing topic
		const topicSubscribers = await loadAdminTopicSubscribers(context.req.param("id"))
		return topicSubscribers
			? context.json({ subscribers: topicSubscribers })
			: context.json({ error: "not found" }, 404)
	})
	.get("/admin/reports", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the open reports, newest first, admin only
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		return context.json({ reports: await loadOpenReports() })
	})
	.post("/admin/reports/:id/resolve", zValidator("json", resolveReportPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// remove the reported content or keep it, and close the report, admin only
		if (!(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const isResolved = await resolveReport({
			context,
			adminUserId: userId,
			reportId: context.req.param("id"),
			resolution: context.req.valid("json").resolution,
		})
		return isResolved ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.post("/admin/users/:id/budget", zValidator("json", budgetOverridePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// set or clear a user's budget override and resize their key to the new budget, admin only.
		if (!(await isAllowed(userId, "admin:setBudget"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		const budgetOverrideOutcome = await setUserBudgetOverride(
			context.req.param("id"),
			context.req.valid("json").budgetOverrideCents,
		)
		if (budgetOverrideOutcome === "missing") {
			return context.json({ error: "not found" }, 404)
		}
		// the saved budget is reported either way, with a flag if the proxy key did not follow it
		return context.json({ ok: true, isKeyResized: budgetOverrideOutcome === "applied" })
	})
