// the invite links and their acceptance: creating a token, revoking one, and accepting an invite url
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import type { Invite, InviteSource } from "@shared/contracts"
import { inviteCreatePayload } from "@shared/contracts"
import { PLANS } from "@shared/plans"
import { and, desc, eq, isNull, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { canCreateInvitesToday, loadUserAccess } from "../../db/quotas"
import { invites, teamMembers, teams, topics, users } from "../../db/schema"
import { isAllowed, isLeaderRole } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { joinTeam, toTeamRole } from "../team/members"
import { loadDirectSubscription } from "../topic/permissions"
import { activateSubscription } from "../topic/subscriptions"

// how long an invite link works for. an email invite gets one use and never expires
const LINK_INVITE_DAYS = 30

// how an acceptance ended: the topic or team page to open, or which way the token failed
export type InviteAcceptResult =
	| { status: "joined"; topicId: string; topicName: string }
	| { status: "joinedTeam"; teamId: string; teamName: string }
	| { status: "requestedTeam"; teamId: string; teamName: string }
	| { status: "teamFull"; teamId: string; teamName: string }
	| { status: "expired" | "exhausted" | "unknown" }

/**
 * Create an invite link for a topic, naming nobody. Whoever holds its token may accept it until its uses run out
 * or its expiry passes.
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

	// reuse the caller's live link for this topic instead of writing a second row
	const liveLinkInvite = await toLiveLinkInvite(userId, { topicId })
	if (liveLinkInvite) {
		trackEvent("invite_reused", userId, { ...analyticsProperties, topicId, source })
		return toInvite(liveLinkInvite)
	}

	// the per-account daily limit, checked before anything is written
	if (!(await canCreateInvitesToday(userId))) {
		return "limited"
	}

	// the link names no address, so it has a use limit and an expiry instead
	const expiresAt = new Date(Date.now() + LINK_INVITE_DAYS * 24 * 60 * 60 * 1000)
	const [invite] = await db
		.insert(invites)
		.values({ topicId, invitedByUserId: userId, maxUses: await toLinkInviteMaxUses(userId), expiresAt })
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

	// reuse the caller's live link for this team instead of writing a second row
	const liveLinkInvite = await toLiveLinkInvite(userId, { teamId })
	if (liveLinkInvite) {
		trackEvent("invite_reused", userId, { ...analyticsProperties, teamId, source })
		return toInvite(liveLinkInvite)
	}

	// the per-account daily limit, checked before anything is written
	if (!(await canCreateInvitesToday(userId))) {
		return "limited"
	}

	// the link names no address, so it has a use limit and an expiry instead
	const expiresAt = new Date(Date.now() + LINK_INVITE_DAYS * 24 * 60 * 60 * 1000)
	const [invite] = await db
		.insert(invites)
		.values({ teamId, invitedByUserId: userId, maxUses: await toLinkInviteMaxUses(userId), expiresAt })
		.returning()

	// record which control created the invite
	trackEvent("invite_created", userId, { ...analyticsProperties, teamId, source })
	return invite ? toInvite(invite) : "forbidden"
}

/**
 * Returns the topic or team a live token opens, or null when it is unknown, expired, or spent.
 */
export async function toInviteTarget(token: string): Promise<{ topicId: string } | { teamId: string } | null> {
	const [invite] = await db.select().from(invites).where(eq(invites.token, token))
	if (!invite || (await toTokenRejection(invite))) {
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

	// a dead team link still has a real signup behind it, so it lands as a join request instead of a dead end
	const rejection = await toTokenRejection(invite)
	if (rejection) {
		if (invite.teamId) {
			return acceptAsJoinRequest(userId, invite)
		}
		return { status: rejection }
	}
	return invite.teamId ? acceptTeamInvite(userId, invite) : acceptTopicInvite(userId, invite)
}

// a topic invite's acceptance: the subscription, and the use spent conditional on the limit
export async function acceptTopicInvite(
	userId: string,
	invite: typeof invites.$inferSelect,
): Promise<InviteAcceptResult> {
	// the topic the token opens, with its visibility for the public-topic waiver below
	const [topic] = await db
		.select({ id: topics.id, name: topics.name, visibility: topics.visibility })
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

	// the token use is spent first. Follow already opens a public topic, so an exhausted link still admits
	if (!(await spendInviteUse(invite.id)) && topic.visibility !== "public") {
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
	const isAutomaticJoin = isLeaderInvite || (await isInviteForUser(invite, userId))

	// an open link admits when some other live invitation already names this person
	const automaticInvite = isAutomaticJoin ? null : await toAutomaticInvite(userId, teamRow.id, invite.id)

	// an open link from a member arrives as a join request a team leader activates
	if (!isAutomaticJoin && !automaticInvite) {
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
		return { status: "teamFull", teamId: teamRow.id, teamName: teamRow.name }
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
	userInvite: Pick<typeof invites.$inferSelect, "id" | "expiresAt" | "maxUses" | "usedCount"> | undefined,
	acceptedInviteId: string,
	now: Date,
): boolean {
	// the invitation being accepted cannot vouch for itself, and a dead one vouches for nobody
	return Boolean(userInvite && userInvite.id !== acceptedInviteId && !toInviteRejection(userInvite, now))
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
	const userInvites = await db
		.select()
		.from(invites)
		.where(and(eq(invites.teamId, teamId), isAddressedToUser))
	return userInvites.find((invite) => isAutomaticInvite(invite, acceptedInviteId, new Date())) ?? null
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
	// a declined, expired, or used up invite cannot be handed out, so none of them are listed
	const inviteRows = await db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.topicId, topicId),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
				sql`${invites.usedCount} < ${invites.maxUses}`,
			),
		)
		.orderBy(invites.invitedAt)
	return inviteRows.map(toInvite)
}

// the caller's newest link invite for the target that can still be handed out, or null when none is live.
// scoped to the creator. a leader's team link auto-joins while a member's is a join request
async function toLiveLinkInvite(
	userId: string,
	target: { topicId: string } | { teamId: string },
): Promise<typeof invites.$inferSelect | null> {
	const targetMatch = "topicId" in target ? eq(invites.topicId, target.topicId) : eq(invites.teamId, target.teamId)
	const [invite] = await db
		.select()
		.from(invites)
		.where(
			and(
				targetMatch,
				eq(invites.invitedByUserId, userId),
				isNull(invites.email),
				isNull(invites.invitedUserId),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
				sql`${invites.usedCount} < ${invites.maxUses}`,
			),
		)
		.orderBy(desc(invites.invitedAt))
		.limit(1)
	return invite ?? null
}

// how many people this creator's links let in, read from their plan
async function toLinkInviteMaxUses(userId: string): Promise<number> {
	const { plan } = await loadUserAccess(userId)
	return PLANS[plan].linkInviteMaxUses
}

// a token's rejection, with time and use limits waived for a currently-public topic, which Follow opens anyway
async function toTokenRejection(invite: typeof invites.$inferSelect): Promise<"expired" | "exhausted" | null> {
	const rejection = toInviteRejection(invite, new Date())
	if (!rejection || !invite.topicId) {
		return rejection
	}
	const [topic] = await db.select({ visibility: topics.visibility }).from(topics).where(eq(topics.id, invite.topicId))
	return topic?.visibility === "public" ? null : rejection
}

// a dead team link's acceptance: a join request for a leader to activate
async function acceptAsJoinRequest(userId: string, invite: typeof invites.$inferSelect): Promise<InviteAcceptResult> {
	const [teamRow] = await db
		.select({ id: teams.id, name: teams.name })
		.from(teams)
		.where(eq(teams.id, invite.teamId ?? ""))
	if (!teamRow) {
		return { status: "unknown" }
	}

	// someone already on the team just goes there
	if ((await toTeamRole(userId, teamRow.id)) !== null) {
		return { status: "joinedTeam", teamId: teamRow.id, teamName: teamRow.name }
	}
	await db
		.insert(teamMembers)
		.values({ teamId: teamRow.id, userId, invitedByUserId: invite.invitedByUserId, isActive: false })
		.onConflictDoNothing()
	return { status: "requestedTeam", teamId: teamRow.id, teamName: teamRow.name }
}

/**
 * Which way a token is no longer good, or null while it can still be accepted: it ran out of time, or out of uses.
 */
export function toInviteRejection(
	invite: Pick<typeof invites.$inferSelect, "expiresAt" | "maxUses" | "usedCount">,
	now: Date,
): "expired" | "exhausted" | null {
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
	.post("/invite/:token", async (context) => {
		// signup runs the app's one bot check, so a session is the whole requirement here
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json(await acceptInviteToken(userId, context.req.param("token")))
	})
