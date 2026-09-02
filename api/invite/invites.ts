// the invite links and their acceptance: creating a token, revoking one, and accepting an invite url
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import type { Invite, InviteSource } from "@shared/contracts"
import { inviteAcceptPayload, inviteCreatePayload } from "@shared/contracts"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { canCreateInvitesToday } from "../../db/quotas"
import { invites, teamMembers, teams, topics, users } from "../../db/schema"
import { verifyTurnstileToken } from "../auth"
import { isAllowed, isLeaderRole } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { joinTeam, toTeamRole } from "../team/members"
import { loadDirectSubscription } from "../topic/permissions"
import { activateSubscription } from "../topic/subscriptions"

// how many people one invite link lets in, and how long it works for. an email invite is unlimited
const LINK_INVITE_MAX_USES = 25
const LINK_INVITE_DAYS = 30

// how an acceptance ended: the topic or team page to open, or which way the token failed
export type InviteAcceptResult =
	| { status: "joined"; topicId: string; topicName: string }
	| { status: "joinedTeam"; teamId: string; teamName: string }
	| { status: "requestedTeam"; teamId: string; teamName: string }
	| { status: "revoked" | "expired" | "exhausted" | "unknown" }

/**
 * Create an invite link for a topic, naming nobody. Whoever holds its token may accept it until its uses run out,
 * its expiry passes, or the owner revokes it.
 */
export async function createTopicInvite(
	userId: string,
	topicId: string,
	source: InviteSource,
	analyticsProperties: AnalyticsProperties,
): Promise<Invite | "forbidden" | "limited"> {
	// only someone who may edit the topic may invite to it, which is its owner or an admin
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:edit", topic))) {
		return "forbidden"
	}

	// the per-account daily limit, checked before anything is written
	if (!(await canCreateInvitesToday(userId))) {
		return "limited"
	}

	// the link names no address, so it has a use limit and an expiry instead
	const expiresAt = new Date(Date.now() + LINK_INVITE_DAYS * 24 * 60 * 60 * 1000)
	const [invite] = await db
		.insert(invites)
		.values({ topicId, invitedByUserId: userId, maxUses: LINK_INVITE_MAX_USES, expiresAt })
		.returning()
	if (!invite) {
		return "forbidden"
	}

	// record which control created the invite
	trackEvent("invite_created", userId, { ...analyticsProperties, topicId, source })
	return toInvite(invite)
}

/**
 * Any team member's can create an invite link for a team with the same limits and lifecycle a topic link has.
 */
export async function createTeamInvite(
	userId: string,
	teamId: string,
	source: InviteSource,
	analyticsProperties: AnalyticsProperties,
): Promise<Invite | "forbidden" | "limited"> {
	// only a team member may invite to their team
	if ((await toTeamRole(userId, teamId)) === null) {
		return "forbidden"
	}

	// the per-account daily limit, checked before anything is written
	if (!(await canCreateInvitesToday(userId))) {
		return "limited"
	}

	// the link names no address, so it has a use limit and an expiry instead
	const expiresAt = new Date(Date.now() + LINK_INVITE_DAYS * 24 * 60 * 60 * 1000)
	const [invite] = await db
		.insert(invites)
		.values({ teamId, invitedByUserId: userId, maxUses: LINK_INVITE_MAX_USES, expiresAt })
		.returning()

	// record which control created the invite
	trackEvent("invite_created", userId, { ...analyticsProperties, teamId, source })
	return invite ? toInvite(invite) : "forbidden"
}

/**
 * Revoke one invite by setting a revokedAt time.
 */
export async function revokeTopicInvite(userId: string, topicId: string, inviteId: string): Promise<boolean> {
	// only someone who may edit the topic may revoke its invites
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:edit", topic))) {
		return false
	}

	// scoped to this topic as well as the invite, so an id from another topic cannot revoke through it
	await db
		.update(invites)
		.set({ revokedAt: new Date() })
		.where(and(eq(invites.id, inviteId), eq(invites.topicId, topicId)))
	return true
}

/**
 * Returns the topic or team a live token opens, or null when it is unknown, revoked, expired, or spent.
 */
export async function toInviteTarget(token: string): Promise<{ topicId: string } | { teamId: string } | null> {
	const [invite] = await db.select().from(invites).where(eq(invites.token, token))
	if (!invite || toInviteRefusal(invite, new Date())) {
		return null
	}

	// exactly one of the two is set, and the check constraint on the table is what guarantees it
	if (invite.teamId) {
		return { teamId: invite.teamId }
	}
	return invite.topicId ? { topicId: invite.topicId } : null
}

/**
 * Accept a join token for the user. A topic invite subscribes them to the topic it opens.
 * A team invite makes them a team member.
 */
export async function acceptInviteToken(userId: string, token: string): Promise<InviteAcceptResult> {
	// the token is the whole credential, so it is looked up on its own
	const [invite] = await db.select().from(invites).where(eq(invites.token, token))
	if (!invite) {
		return { status: "unknown" }
	}

	// each refusal has a reason, so the page can tell a user how to proceed
	const refusal = toInviteRefusal(invite, new Date())
	if (refusal) {
		return { status: refusal }
	}
	return invite.teamId ? acceptTeamInvite(userId, invite) : acceptTopicInvite(userId, invite)
}

// a topic invite's acceptance: the subscription, and the use spent conditional on the limit
export async function acceptTopicInvite(
	userId: string,
	invite: typeof invites.$inferSelect,
): Promise<InviteAcceptResult> {
	// the topic the token opens
	const [topic] = await db
		.select({ id: topics.id, name: topics.name })
		.from(topics)
		.where(eq(topics.id, invite.topicId ?? ""))
	if (!topic) {
		return { status: "unknown" }
	}

	// a user arriving twice, by refreshing or by clicking the link again does not spend another token use
	const joined = { status: "joined", topicId: topic.id, topicName: topic.name } as const
	if ((await loadDirectSubscription(userId, topic.id))?.isActive) {
		return joined
	}

	// the token use is spent first
	if (!(await spendInviteUse(invite.id))) {
		return { status: "exhausted" }
	}
	await activateSubscription(userId, topic.id)
	return joined
}

// a team invite's acceptance: the membership with its inactive subscriptions, and the spent use
export async function acceptTeamInvite(
	userId: string,
	invite: typeof invites.$inferSelect,
): Promise<InviteAcceptResult> {
	// the team the token joins, named by its id
	const [teamRow] = await db
		.select({ id: teams.id, name: teams.name })
		.from(teams)
		.where(eq(teams.id, invite.teamId ?? ""))
	if (!teamRow) {
		return { status: "unknown" }
	}

	// someone already on the team spends no second use
	const joinedTeam = { status: "joinedTeam", teamId: teamRow.id, teamName: teamRow.name } as const
	if ((await toTeamRole(userId, teamRow.id)) !== null) {
		return joinedTeam
	}

	// the use is spent first. its conditional update is what serializes concurrent arrivals
	if (!(await spendInviteUse(invite.id))) {
		return { status: "exhausted" }
	}

	// a leader's invitation joins the team automatically, and so does one addressed to this person by anyone
	const creatorRole = invite.invitedByUserId ? await toTeamRole(invite.invitedByUserId, teamRow.id) : null
	const isLeaderInvite = creatorRole !== null && isLeaderRole(creatorRole)
	const isJoinAutomatically = isLeaderInvite || (await isInviteForUser(invite, userId))

	// an open link admits when some other live invitation already names this person
	const automaticInvite = isJoinAutomatically ? null : await toAutomaticInvite(userId, teamRow.id, invite.id)

	// an open link from a member arrives as a join request a team leader activates
	if (!isJoinAutomatically && !automaticInvite) {
		await db
			.insert(teamMembers)
			.values({ teamId: teamRow.id, userId, invitedByUserId: invite.invitedByUserId, isActive: false })
			.onConflictDoNothing()
		return { status: "requestedTeam", teamId: teamRow.id, teamName: teamRow.name }
	}

	// the automatic invitation did its work, so it is spent like any invitation that was accepted.
	// losing that race refunds the accepted invitation, which nobody joined on
	if (automaticInvite && !(await spendInviteUse(automaticInvite.id))) {
		await refundInviteUse(invite.id)
		return { status: "exhausted" }
	}

	// the team membership with its delivery fan-out, rejected only at the team member limit
	if (!(await joinTeam(userId, teamRow.id, invite.invitedByUserId))) {
		await refundInviteUse(invite.id)
		if (automaticInvite) {
			await refundInviteUse(automaticInvite.id)
		}
		return { status: "exhausted" }
	}
	return joinedTeam
}

/**
 * Whether an invitation is addressed to this user: by their resolved account, or by an email they own.
 */
export async function isInviteForUser(
	invite: Pick<typeof invites.$inferSelect, "invitedUserId" | "email">,
	userId: string,
): Promise<boolean> {
	// a username invite and an email invite to an existing account both resolve to the account
	if (invite.invitedUserId === userId) {
		return true
	}

	// an email invite sent before the recipient signed up resolved to nobody, so it matches by address.
	// signup does not require verifying the address, so only a verified one proves the account owns it
	if (!invite.email) {
		return false
	}
	const [user] = await db
		.select({ email: users.email, isEmailVerified: users.emailVerified })
		.from(users)
		.where(eq(users.id, userId))
	return Boolean(user?.isEmailVerified && user.email === invite.email)
}

/**
 * Whether a live invitation other than the one being accepted admits the accepter on its own.
 */
export function isAutomaticInvite(
	namedInvite:
		| Pick<typeof invites.$inferSelect, "id" | "revokedAt" | "expiresAt" | "maxUses" | "usedCount">
		| undefined,
	acceptedInviteId: string,
	now: Date,
): boolean {
	// the invitation being accepted cannot vouch for itself, and a dead one vouches for nobody
	return Boolean(namedInvite && namedInvite.id !== acceptedInviteId && !toInviteRefusal(namedInvite, now))
}

// a live invitation to this team addressed to this user, or null when none does
async function toAutomaticInvite(
	userId: string,
	teamId: string,
	acceptedInviteId: string,
): Promise<typeof invites.$inferSelect | null> {
	// an invitation addresses a user by their account, or by an address their account verified
	const [user] = await db
		.select({ email: users.email, isEmailVerified: users.emailVerified })
		.from(users)
		.where(eq(users.id, userId))
	const isAddressedToUser = user?.isEmailVerified
		? or(eq(invites.invitedUserId, userId), eq(invites.email, user.email))
		: eq(invites.invitedUserId, userId)

	// both addressings have their own unique row, so either one may match and the first live one admits
	const addressedInvites = await db
		.select()
		.from(invites)
		.where(and(eq(invites.teamId, teamId), isAddressedToUser))
	return addressedInvites.find((invite) => isAutomaticInvite(invite, acceptedInviteId, new Date())) ?? null
}

// one use spent from the token, conditional on the limit. false if the link had none left
async function spendInviteUse(inviteId: string): Promise<boolean> {
	const spent = await db
		.update(invites)
		.set({ usedCount: sql`${invites.usedCount} + 1` })
		.where(and(eq(invites.id, inviteId), sql`${invites.usedCount} < ${invites.maxUses}`))
		.returning({ id: invites.id })
	return spent.length > 0
}

// the spent token use returned for an invite that was rejected after the spend went through
async function refundInviteUse(inviteId: string): Promise<void> {
	await db
		.update(invites)
		.set({ usedCount: sql`${invites.usedCount} - 1` })
		.where(and(eq(invites.id, inviteId), sql`${invites.usedCount} > 0`))
}

/**
 * A topic's pending invites, the ones that can still be accepted, for its owner's invite list.
 */
export async function loadPendingTopicInvites(topicId: string): Promise<Invite[]> {
	// a revoked, declined, expired, or used up invite cannot be handed out, so none of them are listed
	const inviteRows = await db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.topicId, topicId),
				isNull(invites.revokedAt),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
				sql`${invites.usedCount} < ${invites.maxUses}`,
			),
		)
		.orderBy(invites.invitedAt)
	return inviteRows.map(toInvite)
}

/**
 * Which way a token is no longer good, or null while it can still be accepted. A revocation is checked first,
 * and outranks a link running out of time or uses.
 */
export function toInviteRefusal(
	invite: Pick<typeof invites.$inferSelect, "revokedAt" | "expiresAt" | "maxUses" | "usedCount">,
	now: Date,
): "revoked" | "expired" | "exhausted" | null {
	// a revoked link is refused whatever its uses or dates say
	if (invite.revokedAt) {
		return "revoked"
	}
	// an email invite has no expiry, so it never runs out of time
	if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
		return "expired"
	}
	return invite.usedCount >= invite.maxUses ? "exhausted" : null
}

// one invite row. the topic owner's list and the create response both show it
export function toInvite(invite: typeof invites.$inferSelect): Invite {
	return {
		id: invite.id,
		email: invite.email,
		token: invite.token,
		maxUses: invite.maxUses,
		usedCount: invite.usedCount,
		expiresAt: invite.expiresAt?.toISOString() ?? null,
	}
}

// the link routes: creating a link, revoking one, and accepting a join token
export const invitesRoute = new Hono<AppEnv>()
	.post("/topics/:id/invites", zValidator("json", inviteCreatePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a link for this topic, rejected without the authority to invite or past the daily limit
		const { source } = context.req.valid("json")
		const invite = await createTopicInvite(userId, context.req.param("id"), source, toAnalyticsProperties(context))
		// answer each rejection on its own status, so the api client can tell a limit from a forbidden reason
		if (invite === "forbidden") {
			return context.json({ error: "forbidden" }, 403)
		}
		return invite === "limited" ? context.json({ error: "daily invite limit reached" }, 429) : context.json({ invite })
	})
	.delete("/topics/:id/invites/:inviteId", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// revoke the invite, leaving every subscription already made through it in place
		const isRevoked = await revokeTopicInvite(userId, context.req.param("id"), context.req.param("inviteId"))
		return isRevoked ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/teams/:id/invites", zValidator("json", inviteCreatePayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a team link, rejected without membership or past the daily limit
		const { source } = context.req.valid("json")
		const invite = await createTeamInvite(userId, context.req.param("id"), source, toAnalyticsProperties(context))
		if (invite === "forbidden") {
			return context.json({ error: "not found" }, 404)
		}
		return invite === "limited" ? context.json({ error: "daily invite limit reached" }, 429) : context.json({ invite })
	})
	.post("/invite/:token", zValidator("json", inviteAcceptPayload), async (context) => {
		// an invite url is opened by whoever holds it, so the bot check runs before the token is even read
		const { turnstileToken } = context.req.valid("json")
		if (!(await verifyTurnstileToken(turnstileToken))) {
			return context.json({ error: "turnstile failed" }, 400)
		}
		// the visitor signs in first, so the join page sends them through login and back before posting here
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json(await acceptInviteToken(userId, context.req.param("token")))
	})
