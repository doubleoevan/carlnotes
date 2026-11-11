// who a team's page opens for: the team with the user's role on it, their join request, and their pending invite
import { db } from "@carlnotes/db"
import { invites } from "@carlnotes/db/schema/invites"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { verifiedEmailQuery } from "../topic/permissions"

// a team with what the user is to it: their role if they are an active member, whether they asked to join, whether a
// pending invite names them, and whether the team's page opens for them
type TeamPageAccess = {
	team: typeof teams.$inferSelect
	role: (typeof teamMembers.$inferSelect)["role"] | null
	hasRequestedToJoin: boolean
	isInvited: boolean
	canOpen: boolean
}

/**
 * Loads a team with what the user is to it, or null if no team has the id. A private team's page opens only for its
 * members, an admin, and someone with a pending invite.
 */
export async function loadTeamPageAccess(userId: string | null, teamId: string): Promise<TeamPageAccess | null> {
	// read the team and the user's membership row in one query. a signed-out visitor joins no membership row
	const [teamRow] = await db
		.select({ team: teams, membershipRole: teamMembers.role, isMembershipActive: teamMembers.isActive })
		.from(teams)
		.leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), userId ? eq(teamMembers.userId, userId) : sql`false`))
		.where(eq(teams.id, teamId))
	if (!teamRow) {
		return null
	}

	// an active membership is the user's role, and an inactive one is a join request no leader has approved yet
	const { team } = teamRow
	const role = teamRow.isMembershipActive ? teamRow.membershipRole : null
	const hasRequestedToJoin = teamRow.isMembershipActive === false

	// a private team's page opens only for its members, an admin, and someone with a pending invite
	const isMember = Boolean(role)
	const isInvited = !isMember && (await hasPendingTeamInvite(userId, team.id))
	const canOpen = team.isPublic || isMember || isInvited || (await isAllowed(userId, "admin:console"))
	return { team, role, hasRequestedToJoin, isInvited, canOpen }
}

// whether a pending invite names this user, by account or by their email address
async function hasPendingTeamInvite(userId: string | null, teamId: string): Promise<boolean> {
	if (!userId) {
		return false
	}

	// a single matching pending invite row is enough. an address matches only once the account verified it
	const [invite] = await db
		.select({ id: invites.id })
		.from(invites)
		.where(
			and(
				eq(invites.teamId, teamId),
				or(eq(invites.invitedUserId, userId), inArray(invites.email, verifiedEmailQuery(userId))),
				eq(invites.usedCount, 0),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
			),
		)
		.limit(1)
	return Boolean(invite)
}
