// the teams page read: the user's teams, the team invites waiting for an answer, and the team invites sent
import { toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import type { TeamsPageResponse } from "@carlnotes/contracts/teams"
import { db } from "@carlnotes/db"
import { invites } from "@carlnotes/db/schema/invites"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { users } from "@carlnotes/db/schema/users"
import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { toProfileIdentity } from "../avatars"
import { verifiedEmailQuery } from "../topic/permissions"
import { loadTeamSummaries, senders, toCountsByTeamId, toSpendByTeamId } from "./helpers"

/**
 * The teams page sections: the user's teams, the team invites waiting for an answer, and the team invites sent.
 */
export async function loadTeamsPage(userId: string): Promise<TeamsPageResponse> {
	// the team ids that the user is a member of
	const userTeamSummaries = await loadTeamSummaries(userId)
	const userTeamIds = new Set(userTeamSummaries.map((teamSummary) => teamSummary.teamId))

	// the team invites waiting for an answer
	const inviteRows = await db
		.select({
			inviteId: invites.id,
			teamId: teams.id,
			name: teams.name,
			isPublic: teams.isPublic,
			description: teams.description,
			avatarKey: teams.avatarKey,
			invitedAt: invites.invitedAt,
			// the sender's account, null if it has closed
			sender: {
				userId: senders.id,
				username: senders.username,
				avatarSource: senders.avatarSource,
				avatarKey: senders.avatarKey,
			},
		})
		.from(invites)
		.innerJoin(teams, eq(teams.id, invites.teamId))
		.leftJoin(senders, eq(senders.id, invites.invitedByUserId))
		.where(
			// pending means unanswered: no spent use, no decline, no revocation, no passed expiry.
			// an address matches only once the account verified it
			and(
				or(eq(invites.invitedUserId, userId), inArray(invites.email, verifiedEmailQuery(userId))),
				eq(invites.usedCount, 0),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
			),
		)
		.orderBy(desc(invites.invitedAt))

	// a team the user already belongs to does not show an invite
	const receivedInviteRows = inviteRows.filter((inviteRow) => !userTeamIds.has(inviteRow.teamId))

	// each remaining invite includes the counts and spend its table row shows, read in one pass each
	const invitedTeamIds = receivedInviteRows.map((inviteRow) => inviteRow.teamId)
	const [countsByTeamId, spendByTeamId] = await Promise.all([
		toCountsByTeamId(invitedTeamIds),
		toSpendByTeamId(invitedTeamIds),
	])
	const receivedInvites = receivedInviteRows.map((inviteRow) => ({
		inviteId: inviteRow.inviteId,
		teamId: inviteRow.teamId,
		name: inviteRow.name,
		isPublic: inviteRow.isPublic,
		avatarVersion: toAvatarKeyVersion(inviteRow.avatarKey),
		description: inviteRow.description,
		memberCount: countsByTeamId.get(inviteRow.teamId)?.memberCount ?? 0,
		topicCount: countsByTeamId.get(inviteRow.teamId)?.topicCount ?? 0,
		scanSpendCents: spendByTeamId.get(inviteRow.teamId)?.scanCents ?? 0,
		chatSpendCents: spendByTeamId.get(inviteRow.teamId)?.chatCents ?? 0,
		sender: toProfileIdentity(inviteRow.sender),
		invitedAt: inviteRow.invitedAt.toISOString(),
	}))

	// the user sent team invitations showing whether each invitee joined
	const sentInvites = await loadSentTeamInvites(userId)
	return { teams: userTeamSummaries, receivedInvites, sentInvites }
}

// the sent team invitations, matched by email or by account. declined rows stay stored but are hidden here
async function loadSentTeamInvites(userId: string): Promise<TeamsPageResponse["sentInvites"]> {
	// two single-column joins let each side use its own unique index, then coalesce selects the resolved account first
	const usersByEmail = alias(users, "users_by_email")
	const inviteeId = sql<string | null>`coalesce(${users.id}, ${usersByEmail.id})`
	const sentInviteRows = await db
		.select({
			inviteId: invites.id,
			teamId: teams.id,
			name: teams.name,
			teamAvatarKey: teams.avatarKey,
			inviteeEmail: invites.email,
			invitedAt: invites.invitedAt,
			// the invitee's account fields, null until the invitation names or resolves to an account
			invitee: {
				userId: inviteeId,
				username: sql<string | null>`coalesce(${users.username}, ${usersByEmail.username})`,
				avatarSource: sql<string | null>`coalesce(${users.avatarSource}, ${usersByEmail.avatarSource})`,
				// the key of the account that the id names. a coalesce here could return the other account's key
				avatarKey: sql<
					string | null
				>`case when ${users.id} is not null then ${users.avatarKey} else ${usersByEmail.avatarKey} end`,
			},
			joinedAt: teamMembers.createdAt,
		})
		.from(invites)
		.innerJoin(teams, eq(teams.id, invites.teamId))
		.leftJoin(users, eq(users.id, invites.invitedUserId))
		.leftJoin(usersByEmail, eq(usersByEmail.email, invites.email))
		.leftJoin(
			teamMembers,
			and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, inviteeId), eq(teamMembers.isActive, true)),
		)
		.where(
			// only the rows that name a person: a link invitation names nobody and lives on the team page instead
			and(
				eq(invites.invitedByUserId, userId),
				or(isNotNull(invites.email), isNotNull(invites.invitedUserId)),
				isNull(invites.declinedAt),
			),
		)
		.orderBy(desc(invites.invitedAt))
	return sentInviteRows.map((inviteRow) => ({
		inviteId: inviteRow.inviteId,
		teamId: inviteRow.teamId,
		name: inviteRow.name,
		avatarVersion: toAvatarKeyVersion(inviteRow.teamAvatarKey),
		inviteeEmail: inviteRow.inviteeEmail,
		invitee: toProfileIdentity(inviteRow.invitee),
		invitedAt: inviteRow.invitedAt.toISOString(),
		joinedAt: inviteRow.joinedAt?.toISOString() ?? null,
	}))
}
