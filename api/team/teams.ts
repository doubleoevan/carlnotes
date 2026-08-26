// the team routes and the logic behind them: creating a team, attaching and detaching topics, the public toggle,
// deletion
import { zValidator } from "@hono/zod-validator"
import {
	addTopicPayload,
	createTeamPayload,
	memberRolePayload,
	memberVisibilityPayload,
	updateTeamPayload,
} from "@shared/contracts"
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { canCreateTeamToday, loadUserAccess } from "../../db/quotas"
import { invites, subscriptions, teamMembers, teams, teamTopics, topics } from "../../db/schema"
import { isLeaderRole } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { canSeeTopic } from "../topic/permissions"
import { updateTopicSubscriberCount } from "../topic/subscriberCounts"
import { isUniqueViolation } from "../usernames"
import { loadTeamPage, loadTeamsPage, searchTeams, toGatedTeam } from "./helpers"
import {
	approveJoinTeamRequest,
	type DbTransaction,
	deactivateTeamTopicSubscriptions,
	deleteJoinTeamRequest,
	removeTeamMember,
	requestToJoinTeam,
	saveTeamTopicSubscriptions,
	setTeamMemberRole,
	toTeamRole,
} from "./members"

/**
 * Create a team with the user as its leader, attaching any unattached topics named. Rejected past
 * the daily creation limit. The page lives at the team id, like a profile's.
 */
export async function createTeam(
	userId: string,
	payload: { name: string; topicIds: string[]; description?: string | null; isPublic?: boolean },
): Promise<{ status: "created"; teamId: string } | { status: "quota" } | { status: "name-taken" }> {
	// the daily creation limit is checked before anything is written
	const { isAdmin } = await loadUserAccess(userId)
	if (!isAdmin && !(await canCreateTeamToday(userId))) {
		return { status: "quota" }
	}

	// the team, its leader, and the named topics are written together
	const teamId = crypto.randomUUID()
	try {
		await db.transaction(async (transaction) => {
			await transaction.insert(teams).values({
				id: teamId,
				name: payload.name,
				description: payload.description ?? null,
				isPublic: payload.isPublic ?? false,
			})
			await transaction.insert(teamMembers).values({ teamId, userId, role: "leader" })
			// each named topic attaches through the same write the attach route uses
			for (const topicId of payload.topicIds) {
				await addTopicInTransaction(transaction, userId, teamId, topicId)
			}
		})
	} catch (error) {
		// the case-insensitive unique index catches a create racing for a taken name
		if (isUniqueViolation(error)) {
			return { status: "name-taken" }
		}
		throw error
	}
	return { status: "created", teamId }
}

/**
 * Attach a topic to the acting leader's team. A topic this team already holds is rejected instead of re-added.
 */
export async function addTopicToTeam(
	userId: string,
	teamId: string,
	topicId: string,
): Promise<"added" | "forbidden" | "alreadyAdded"> {
	// attaching is a leader's power
	if ((await toTeamRole(userId, teamId)) !== "leader") {
		return "forbidden"
	}
	return db.transaction((transaction) => addTopicInTransaction(transaction, userId, teamId, topicId))
}

// the attach write shared by creation and the attach route
async function addTopicInTransaction(
	transaction: DbTransaction,
	userId: string,
	teamId: string,
	topicId: string,
): Promise<"added" | "forbidden" | "alreadyAdded"> {
	// anyone may hand over a topic they can read, except a private one, which stays its owner's alone
	const [topic] = await transaction.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return "forbidden"
	}
	// readable and not someone else's private one
	const isAddable = (topic.visibility !== "private" || topic.ownerId === userId) && (await canSeeTopic(userId, topic))
	if (!isAddable) {
		return "forbidden"
	}
	// this team having it already, as its owner or through a share, is the one rejection left
	if (topic.teamId === teamId) {
		return "alreadyAdded"
	}
	// the share half of the check
	const [heldShare] = await transaction
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(and(eq(teamTopics.teamId, teamId), eq(teamTopics.topicId, topicId)))
		.limit(1)
	if (heldShare) {
		return "alreadyAdded"
	}

	// only the topic owner's own teams may become the owning team
	const [ownerLeadsTarget] = await transaction
		.select({ userId: teamMembers.userId })
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.teamId, teamId),
				eq(teamMembers.userId, topic.ownerId),
				eq(teamMembers.role, "leader"),
				eq(teamMembers.isActive, true),
			),
		)
		.limit(1)

	// an unowned topic becomes this team's own when the owner leads here
	if (!topic.teamId && ownerLeadsTarget) {
		const addedRows = await transaction
			.update(topics)
			.set({ teamId })
			.where(and(eq(topics.id, topicId), isNull(topics.teamId)))
			.returning({ id: topics.id })

		// an empty return means another team owned it between the read and here
		if (addedRows.length === 0) {
			return "alreadyAdded"
		}
	} else {
		// the share row for every other case
		const sharedRows = await transaction
			.insert(teamTopics)
			.values({ teamId, topicId })
			.onConflictDoNothing()
			.returning({ topicId: teamTopics.topicId })

		// an empty return means this team already holds it
		if (sharedRows.length === 0) {
			return "alreadyAdded"
		}
	}

	// the delivery: every activated member's muted subscription, written after the topic attached
	const teamMemberRows = await transaction
		.select({ userId: teamMembers.userId })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
	await saveTeamTopicSubscriptions(
		transaction,
		teamMemberRows.map((teamMemberRow) => teamMemberRow.userId),
		[{ id: topicId, frequency: topic.frequency }],
	)
	return "added"
}

/**
 * Detach a topic from the team, ending team access while ownership never moved.
 */
export async function removeTopicFromTeam(userId: string, teamId: string, topicId: string): Promise<boolean> {
	// detaching is a leader's power, and the topic's owner may always pull their own topic back
	const [topic] = await db
		.select({ ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if ((await toTeamRole(userId, teamId)) !== "leader" && topic?.ownerId !== userId) {
		return false
	}

	// scoped to this team, so a stale id cannot detach through it
	await db.transaction(async (transaction) => {
		// the team's active members, whose subscriptions the deactivation below is scoped to
		const memberRows = await transaction
			.select({ userId: teamMembers.userId })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))

		// whichever way this team has it ends: the owning column or the shared-in row
		await transaction
			.update(topics)
			.set({ teamId: null })
			.where(and(eq(topics.id, topicId), eq(topics.teamId, teamId)))
		await transaction.delete(teamTopics).where(and(eq(teamTopics.teamId, teamId), eq(teamTopics.topicId, topicId)))

		// when the owning team lets go, the oldest team with it that the topic's owner leads becomes the owning team
		if (topic && topic.teamId === teamId) {
			const [nextOwningTeam] = await transaction
				.select({ teamId: teamTopics.teamId })
				.from(teamTopics)
				.innerJoin(
					teamMembers,
					and(
						eq(teamMembers.teamId, teamTopics.teamId),
						eq(teamMembers.userId, topic.ownerId),
						eq(teamMembers.role, "leader"),
					),
				)
				.where(eq(teamTopics.topicId, topicId))
				.orderBy(teamTopics.createdAt)
				.limit(1)

			// the next owning team's share row becomes the owning-team column
			if (nextOwningTeam) {
				await transaction.update(topics).set({ teamId: nextOwningTeam.teamId }).where(eq(topics.id, topicId))
				await transaction
					.delete(teamTopics)
					.where(and(eq(teamTopics.teamId, nextOwningTeam.teamId), eq(teamTopics.topicId, topicId)))
			}
		}

		// members still reached through another team that has it keep their subscription
		const coveredMemberIds = transaction
			.select({ userId: teamMembers.userId })
			.from(teamMembers)
			.innerJoin(teamTopics, eq(teamTopics.teamId, teamMembers.teamId))
			.where(and(eq(teamTopics.topicId, topicId), eq(teamMembers.isActive, true)))

		// the owning team's members count as covered the same way
		const owningTeamMemberIds = transaction
			.select({ userId: teamMembers.userId })
			.from(teamMembers)
			.innerJoin(topics, eq(topics.teamId, teamMembers.teamId))
			.where(and(eq(topics.id, topicId), eq(teamMembers.isActive, true)))

		// everyone else loses the subscription it fanned out
		const memberIds = memberRows.map((memberRow) => memberRow.userId).filter((id) => id !== topic?.ownerId)
		if (memberIds.length > 0) {
			await transaction
				.update(subscriptions)
				.set({ isActive: false, isEmailEnabled: false })
				.where(
					and(
						eq(subscriptions.topicId, topicId),
						inArray(subscriptions.subscriberUserId, memberIds),
						notInArray(subscriptions.subscriberUserId, coveredMemberIds),
						notInArray(subscriptions.subscriberUserId, owningTeamMemberIds),
					),
				)
			// the stored count updates after the deactivations
			await updateTopicSubscriberCount(topicId, transaction)
		}
	})
	return true
}

/**
 * Update the team's name, description, or visibility. Leader-only.
 */
export async function updateTeam(
	userId: string,
	teamId: string,
	payload: { name?: string; description?: string | null; isPublic?: boolean },
): Promise<"saved" | "forbidden" | "name-taken"> {
	// updating is a leader's power
	if ((await toTeamRole(userId, teamId)) !== "leader") {
		return "forbidden"
	}

	// the case-insensitive unique index catches a rename onto a taken name
	try {
		await db.update(teams).set(payload).where(eq(teams.id, teamId))
	} catch (error) {
		// only the duplicate is named
		if (isUniqueViolation(error)) {
			return "name-taken"
		}
		throw error
	}
	return "saved"
}

/**
 * Delete the team. Its topics return to their owners through the set-null and member delivery ends.
 */
export async function deleteTeam(userId: string, teamId: string): Promise<boolean> {
	if ((await toTeamRole(userId, teamId)) !== "leader") {
		return false
	}

	// delivery ends before the row goes, while the membership list still says who to deactivate
	await db.transaction(async (transaction) => {
		const memberRows = await transaction
			.select({ userId: teamMembers.userId })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
		await deactivateTeamTopicSubscriptions(
			transaction,
			teamId,
			memberRows.map((memberRow) => memberRow.userId),
		)
		await transaction.delete(teams).where(eq(teams.id, teamId))
	})
	return true
}

// the team routes. reads return a 404 for anything the user may not know exists
export const teamsRoute = new Hono<AppEnv>()
	// which teams the query finds by name, for the search bar's suggestions
	.get("/teams/search", async (context) => {
		return context.json({ teams: await searchTeams(context.req.query("q") ?? "", currentUser(context)) })
	})
	.get("/teams/name-check", async (context) => {
		// whether a name is taken, compared in lowercase like the index that enforces it
		if (!currentUser(context)) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// an empty query is never taken
		const name = (context.req.query("name") ?? "").trim()
		const [taken] = name
			? await db.select({ id: teams.id }).from(teams).where(sql`lower(${teams.name}) = lower(${name})`).limit(1)
			: []
		return context.json({ isTaken: taken !== undefined })
	})
	.get("/teams", async (context) => {
		// reject a signed-out visitor. the email joins the address-invited rows to this account
		const user = context.get("user")
		if (!user) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json(await loadTeamsPage(user.id, user.email))
	})
	.post("/teams", zValidator("json", createTeamPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create the team, answering which way a rejection went so the modal can say so
		const created = await createTeam(userId, context.req.valid("json"))
		if (created.status === "created") {
			return context.json(created)
		}
		// a taken name is reported by name, and the daily creation limit is the other rejection creation has
		if (created.status === "name-taken") {
			return context.json({ error: "name-taken" }, 409)
		}
		return context.json({ error: "team limit reached" }, 429)
	})
	.get("/teams/:id/page", async (context) => {
		// the page payload, or the gate a private team shows an outsider: its name and nothing else
		const userId = currentUser(context)
		const teamPage = await loadTeamPage(userId, context.req.param("id"))
		if (teamPage) {
			return context.json(teamPage)
		}
		// no team behind the id at all still reads as nothing existing
		const gatedTeam = await toGatedTeam(userId, context.req.param("id"))
		return gatedTeam
			? context.json(
					{ error: "forbidden", teamName: gatedTeam.name, hasRequestedToJoin: gatedTeam.hasRequestedToJoin },
					403,
				)
			: context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/join-requests", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// ask to join. a missing team and a member both answer not found, telling an outsider nothing
		const isRequested = await requestToJoinTeam(userId, context.req.param("id"))
		return isRequested ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.delete("/teams/:id/join-requests/me", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// take back the user's own request
		await deleteJoinTeamRequest(userId, context.req.param("id"))
		return context.json({ ok: true })
	})
	.post("/teams/:id/join-requests/:userId/approve", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// admit the requester. a team hides from non-leaders, so its forbidden returns not found
		const outcome = await approveJoinTeamRequest(userId, context.req.param("id"), context.req.param("userId"))
		if (outcome === "forbidden") {
			return context.json({ error: "not found" }, 404)
		}
		return outcome === "limited" ? context.json({ error: "team is full" }, 409) : context.json({ ok: true })
	})
	.patch("/teams/:id", zValidator("json", updateTeamPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// a taken name is reported by name, and everything else by whether the save held
		const saved = await updateTeam(userId, context.req.param("id"), context.req.valid("json"))
		if (saved === "name-taken") {
			return context.json({ error: "name-taken" }, 409)
		}
		return saved === "saved" ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.delete("/teams/:id", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const isDeleted = await deleteTeam(userId, context.req.param("id"))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/topics", zValidator("json", addTopicPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// attach, rejecting a topic this team already holds with a message naming the conflict
		const attached = await addTopicToTeam(userId, context.req.param("id"), context.req.valid("json").topicId)
		if (attached === "added") {
			return context.json({ ok: true })
		}

		// many teams may have one topic, so the conflict is this team having it already, never another team
		return attached === "alreadyAdded"
			? context.json({ error: "This team already has that topic." }, 409)
			: context.json({ error: "That topic isn't yours to add." }, 404)
	})
	.delete("/teams/:id/topics/:topicId", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const isRemoved = await removeTopicFromTeam(userId, context.req.param("id"), context.req.param("topicId"))
		return isRemoved ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/members/:userId/role", zValidator("json", memberRolePayload), async (context) => {
		// reject a signed-out visitor
		const actingUserId = currentUser(context)
		if (!actingUserId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// promote or demote, holding the last leader in place
		const saved = await setTeamMemberRole(
			actingUserId,
			context.req.param("id"),
			context.req.param("userId"),
			context.req.valid("json").role,
		)
		if (saved === "saved") {
			return context.json({ ok: true })
		}

		// the last leader stays until another exists
		return saved === "lastLeader"
			? context.json({ error: "promote another leader first" }, 409)
			: context.json({ error: "not found" }, 404)
	})
	.post(
		"/teams/:id/members/:userId/member-visibility",
		zValidator("json", memberVisibilityPayload),
		async (context) => {
			// reject a signed-out visitor
			const actingUserId = currentUser(context)
			if (!actingUserId) {
				return context.json({ error: "unauthorized" }, 401)
			}
			// the opt-out changes only the member's own row, and only for a team they are in
			const targetUserId = context.req.param("userId")
			if (actingUserId !== targetUserId || (await toTeamRole(actingUserId, context.req.param("id"))) === null) {
				return context.json({ error: "not found" }, 404)
			}
			await db
				.update(teamMembers)
				.set({ isMemberVisible: context.req.valid("json").isMemberVisible })
				.where(and(eq(teamMembers.teamId, context.req.param("id")), eq(teamMembers.userId, targetUserId)))
			// the write is the whole answer
			return context.json({ ok: true })
		},
	)
	.delete("/teams/:id/invites/:inviteId", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// a leader may delete any team invitation, and a member only one they created themselves
		const role = await toTeamRole(userId, context.req.param("id"))
		if (!role) {
			return context.json({ error: "not found" }, 404)
		}

		// the creator condition only binds a member, scoped to this team
		const deleted = await db
			.delete(invites)
			.where(
				and(
					eq(invites.id, context.req.param("inviteId")),
					eq(invites.teamId, context.req.param("id")),
					...(isLeaderRole(role) ? [] : [eq(invites.invitedByUserId, userId)]),
				),
			)
			.returning({ id: invites.id })
		if (deleted.length === 0) {
			return context.json({ error: "not found" }, 404)
		}
		// a deleted invitation simply leaves both pages
		return context.json({ ok: true })
	})
	.delete("/teams/:id/members/:userId", async (context) => {
		// reject a signed-out visitor
		const actingUserId = currentUser(context)
		if (!actingUserId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// remove or leave, holding the last leader in place
		const removed = await removeTeamMember(actingUserId, context.req.param("id"), context.req.param("userId"))
		if (removed === "removed") {
			return context.json({ ok: true })
		}
		return removed === "lastLeader"
			? context.json({ error: "promote another leader first" }, 409)
			: context.json({ error: "not found" }, 404)
	})
