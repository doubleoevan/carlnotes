// accepting an invite: the token acceptance, the topic and team acceptances behind it, the spent use, and which way
// a token is no longer good
import { trackEvent } from "@shared/analytics"
import { and, eq, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { invites } from "../../db/schema/invites"
import { teamMembers, teams } from "../../db/schema/teams"
import { topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { isLeaderRole } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { joinTeam, toTeamRole } from "../team/members"
import { loadDirectSubscription } from "../topic/permissions"
import { activateSubscription } from "../topic/subscriptions"

// how an acceptance ended: the topic or team page to open, or which way the token failed
export type InviteAcceptResult =
	| { status: "joined"; topicId: string; topicName: string }
	| { status: "joinedTeam"; teamId: string; teamName: string }
	| { status: "requestedTeam"; teamId: string; teamName: string }
	| { status: "teamFull"; teamId: string; teamName: string }
	| { status: "expired" | "exhausted" | "unknown" }

/**
 * Accept a join token for the user. A topic invite subscribes them to the topic it opens.
 * A team invite makes them a team member.
 */
export async function acceptInviteToken(
	userId: string,
	token: string,
	analyticsProperties?: AnalyticsProperties,
): Promise<InviteAcceptResult> {
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
	// accept the team or the topic the live token names
	return invite.teamId
		? acceptTeamInvite(userId, invite, analyticsProperties)
		: acceptTopicInvite(userId, invite, analyticsProperties)
}

/**
 * Reports an accepted invite with its kind, email, username, or link, and the topic or the team it opens.
 */
export function trackInviteAccepted(
	userId: string,
	invite: typeof invites.$inferSelect,
	analyticsProperties?: AnalyticsProperties,
): void {
	trackEvent("invite_accepted", userId, { ...analyticsProperties, ...toInviteProperties(invite) })
}

// the kind of an invite, and the topic or the team it opens
export function toInviteProperties(invite: typeof invites.$inferSelect): Record<string, string> {
	// an email invite names an address, a username invite names an account, and a link names nobody
	const inviteKind = invite.email ? "email" : invite.invitedUserId ? "username" : "link"
	return invite.teamId
		? { kind: inviteKind, pageKind: "team", teamId: invite.teamId }
		: { kind: inviteKind, pageKind: "topic", topicId: invite.topicId ?? "" }
}

// a topic invite's acceptance: the subscription, and the use spent conditional on the limit
export async function acceptTopicInvite(
	userId: string,
	invite: typeof invites.$inferSelect,
	analyticsProperties?: AnalyticsProperties,
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

	// report the acceptance and the subscription it made
	trackInviteAccepted(userId, invite, analyticsProperties)
	trackEvent("topic_subscribed", userId, {
		...analyticsProperties,
		topicId: topic.id,
		isTopicPublic: topic.visibility === "public",
		subscriptionSource: "invite",
	})
	return joined
}

// a team invite's acceptance: the membership with its inactive subscriptions, and the spent use
export async function acceptTeamInvite(
	userId: string,
	invite: typeof invites.$inferSelect,
	analyticsProperties?: AnalyticsProperties,
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
	// report the acceptance that joined the team
	trackInviteAccepted(userId, invite, analyticsProperties)
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
	// the user's verified address must be the one the invite names
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
 * A token's rejection, with time and use limits waived for a currently-public topic, which Follow opens anyway.
 */
export async function toTokenRejection(invite: typeof invites.$inferSelect): Promise<"expired" | "exhausted" | null> {
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
	// save the request as an inactive membership
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
