// closing a user account, whether an admin does it from the console or the user does it from their own account page

import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import { inviteAccessPayload } from "@shared/contracts"
import { and, asc, count, eq, inArray, ne } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { teamMembers, teams, topics, users } from "../db/schema"
import { deleteAttachment } from "../worker"
import { isAllowed } from "./authorization"
import { cancelUserSubscription } from "./billing"
import { deleteStoredChatAttachments } from "./chat/attachments"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "./currentUser"
import { deleteLiteLLMKey } from "./litellm"
import { deleteTopic } from "./topic/topics"

// promote a new leader to the team if the user is the only leader and there are more than one team member
async function setNewTeamLeaders(userId: string): Promise<void> {
	// the teams they lead where no other active leader remains
	const leaderTeamIds = db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "leader"), eq(teamMembers.isActive, true)))
	const onlyLeaderTeamRows = await db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(
			and(inArray(teamMembers.teamId, leaderTeamIds), eq(teamMembers.role, "leader"), eq(teamMembers.isActive, true)),
		)
		.groupBy(teamMembers.teamId)
		.having(eq(count(), 1))

	for (const { teamId } of onlyLeaderTeamRows) {
		// the longest-standing team member becomes the next team leader
		const [nextTeamLeaderRow] = await db
			.select({ userId: teamMembers.userId })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true), ne(teamMembers.userId, userId)))
			.orderBy(asc(teamMembers.createdAt))
			.limit(1)
		// the longest-standing remaining team member becomes the next leader of the team
		if (nextTeamLeaderRow) {
			await db
				.update(teamMembers)
				.set({ role: "leader" })
				.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, nextTeamLeaderRow.userId)))
			continue
		}

		// nobody else is on the team, so it goes with the account. its topics return to their owners
		await db.delete(teams).where(eq(teams.id, teamId))
	}
}

/**
 * Close an account and everything it owns. "missing" rejection if there is no such user.
 * Whatever can still spend money is canceled first, so a user cannot get charged without a row to explain it.
 */
export async function deleteUser(
	actingUserId: string,
	targetUserId: string,
	analyticsProperties: AnalyticsProperties,
): Promise<"deleted" | "missing"> {
	// a team this user leads alone is settled before the row goes, so the delete is never held up
	await setNewTeamLeaders(targetUserId)

	const [user] = await db
		.select({ id: users.id, avatarKey: users.avatarKey, litellmVirtualKey: users.litellmVirtualKey })
		.from(users)
		.where(eq(users.id, targetUserId))
	if (!user) {
		return "missing"
	}

	// the two things that can still spend money go first, while the account is whole
	await cancelUserSubscription(targetUserId)
	if (user.litellmVirtualKey) {
		await deleteLiteLLMKey(user.litellmVirtualKey)
	}

	// each owned topic goes through the topic delete
	const ownedTopics = await db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, targetUserId))
	for (const topic of ownedTopics) {
		await deleteTopic(actingUserId, topic.id, analyticsProperties)
	}

	// delete everything kept in chat, including on other people's topics, which the deletes above never reached
	await deleteStoredChatAttachments(targetUserId)

	// delete the avatar object if they uploaded one
	if (user.avatarKey) {
		await deleteAttachment(user.avatarKey).catch((error) => console.error("avatar delete failed", error))
	}

	// delete the user row which cascades to sessions, accounts, subscriptions, bookmarks, and the rest.
	await db.delete(users).where(eq(users.id, targetUserId))

	// the row is gone, so this analytics event is the only record of who closed it
	trackEvent("account_deleted", actingUserId, {
		...analyticsProperties,
		targetUserId,
		isSelf: actingUserId === targetUserId,
	})
	return "deleted"
}

// closing an account: an admin closing someone else's, and a user closing their own
export const usersRoute = new Hono<AppEnv>()
	.delete("/admin/users/:id", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// closing someone else's account is admin only
		if (!(await isAllowed(userId, "admin:deleteUser"))) {
			return context.json({ error: "forbidden" }, 403)
		}
		// an admin closes their own account from their account page. the admin console never deletes the current user
		if (context.req.param("id") === userId) {
			return context.json({ error: "close your own account from the account page" }, 409)
		}
		const outcome = await deleteUser(userId, context.req.param("id"), toAnalyticsProperties(context))
		return outcome === "deleted" ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.post("/users/me/invite-access", zValidator("json", inviteAccessPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the setting is the user's own, and invite creation is the only thing reading it
		await db
			.update(users)
			.set({ inviteAccess: context.req.valid("json").inviteAccess })
			.where(eq(users.id, userId))
		return context.json({ ok: true })
	})
	.delete("/users/me", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// a user closes their own account which gets tracked as an analytics event
		await deleteUser(userId, userId, toAnalyticsProperties(context))
		return context.json({ ok: true })
	})
