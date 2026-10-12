// the team routes: the pages, create, update, delete, the topic attach and detach, the members, and the join requests
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import {
	addTopicPayload,
	createTeamPayload,
	memberRolePayload,
	memberVisibilityPayload,
	updateTeamPayload,
} from "@shared/payloads"
import { and, eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { invites } from "../../db/schema/invites"
import { teamMembers, teams } from "../../db/schema/teams"
import { isLeaderRole } from "../authorization"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { searchRateLimiter } from "../rateLimit"
import { deleteTeam } from "./deleteTeam"
import {
	approveJoinTeamRequest,
	deleteJoinTeamRequest,
	removeTeamMember,
	requestToJoinTeam,
	setTeamMemberRole,
	toTeamRole,
} from "./members"
import { searchTeams } from "./search"
import { loadTeamPage } from "./teamPage"
import { addTopicToTeam, createTeam, removeTopicFromTeam, updateTeam } from "./teams"
import { loadTeamsPage } from "./teamsPage"

// the team routes. reads return a 404 for anything the user may not know exists
export const teamsRoute = new Hono<AppEnv>()
	// which teams the query finds by name, for the search bar's suggestions
	.get("/teams/search", searchRateLimiter, async (context) => {
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
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json(await loadTeamsPage(userId))
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
			trackEvent("team_created", userId, { ...toAnalyticsProperties(context), teamId: created.teamId })
			return context.json(created)
		}
		// a taken name is reported by name, and the daily creation limit is the other rejection creation has
		if (created.status === "name-taken") {
			return context.json({ error: "name-taken" }, 409)
		}
		return context.json({ error: "team limit reached" }, 429)
	})
	.get("/teams/:id/page", async (context) => {
		// the team page, or the gate a private team shows a non-member with the team's name and the user's join request
		const teamPageResult = await loadTeamPage(currentUser(context), context.req.param("id"))
		if (teamPageResult.status === "visible") {
			return context.json(teamPageResult.team)
		}
		if (teamPageResult.status === "gated") {
			const { teamName, hasRequestedToJoin } = teamPageResult
			return context.json({ error: "forbidden", teamName, hasRequestedToJoin }, 403)
		}
		// no team has the id
		return context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/join-requests", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// ask to join. a missing team and a member both answer not found, telling a non-member nothing
		const isRequested = await requestToJoinTeam(userId, context.req.param("id"))
		if (!isRequested) {
			return context.json({ error: "not found" }, 404)
		}
		trackEvent("team_join_requested", userId, { ...toAnalyticsProperties(context), teamId: context.req.param("id") })
		return context.json({ ok: true })
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
		if (outcome === "limited") {
			return context.json({ error: "team is full" }, 409)
		}
		// report the approval with the member it admitted
		trackEvent("team_join_approved", userId, {
			...toAnalyticsProperties(context),
			teamId: context.req.param("id"),
			memberUserId: context.req.param("userId"),
		})
		return context.json({ ok: true })
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
		// the answer names whether the team is gone or surviving under a new leader
		const deleteTeamResult = await deleteTeam(userId, context.req.param("id"))
		if (deleteTeamResult.status === "forbidden") {
			return context.json({ error: "not found" }, 404)
		}
		// report the deletion only if the team is gone, not if it survives under a new leader
		if (deleteTeamResult.status === "deleted") {
			trackEvent("team_deleted", userId, { ...toAnalyticsProperties(context), teamId: context.req.param("id") })
		}
		return context.json(deleteTeamResult)
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
			trackEvent("team_topic_added", userId, {
				...toAnalyticsProperties(context),
				teamId: context.req.param("id"),
				topicId: context.req.valid("json").topicId,
			})
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
		// detach the topic, then report it with the team
		const isTopicRemoved = await removeTopicFromTeam(userId, context.req.param("id"), context.req.param("topicId"))
		if (!isTopicRemoved) {
			return context.json({ error: "not found" }, 404)
		}
		trackEvent("team_topic_removed", userId, {
			...toAnalyticsProperties(context),
			teamId: context.req.param("id"),
			topicId: context.req.param("topicId"),
		})
		return context.json({ ok: true })
	})
	.post("/teams/:id/members/:userId/role", zValidator("json", memberRolePayload), async (context) => {
		// reject a signed-out visitor
		const actingUserId = currentUser(context)
		if (!actingUserId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// promote or demote, keeping the last leader in place
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
			trackEvent("team_member_removed", actingUserId, {
				...toAnalyticsProperties(context),
				teamId: context.req.param("id"),
				isSelf: actingUserId === context.req.param("userId"),
			})
			return context.json({ ok: true })
		}
		return removed === "lastLeader"
			? context.json({ error: "promote another leader first" }, 409)
			: context.json({ error: "not found" }, 404)
	})
