// the site search's team reader: the teams whose name contains the query
import { toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import type { TeamSearchRow } from "@carlnotes/contracts/search"
import { db } from "@carlnotes/db"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { and, eq, inArray, like, or, sql } from "drizzle-orm"
import { toContainsLikePattern } from "../likePattern"
import { toCountsByTeamId } from "./helpers"

// who is searching, the trimmed query, and the most rows to read
type SearchTeamsOptions = { userId: string | null; query: string; limit: number }

/**
 * Returns the teams whose name contains the query, shorter names first. A public team is found by anyone, and a
 * signed-in user also finds the teams they belong to at any visibility.
 */
export async function searchTeams(searchTeamsOptions: SearchTeamsOptions): Promise<TeamSearchRow[]> {
	// read the matching teams and their topic and member counts
	const teamRows = await toTeamSearchQuery(searchTeamsOptions)
	const countsByTeamId = await toCountsByTeamId(teamRows.map((teamRow) => teamRow.teamId))

	// shape each as a search row with its avatar version and its counts
	return teamRows.map((teamRow) => ({
		kind: "team",
		id: teamRow.teamId,
		name: teamRow.name,
		path: `/teams/${teamRow.teamId}`,
		date: null,
		count: null,
		team: { teamId: teamRow.teamId, name: teamRow.name, avatarVersion: toAvatarKeyVersion(teamRow.avatarKey) },
		topicCount: countsByTeamId.get(teamRow.teamId)?.topicCount ?? 0,
		memberCount: countsByTeamId.get(teamRow.teamId)?.memberCount ?? 0,
	}))
}

/**
 * Returns the team search's query, shorter names first.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toTeamSearchQuery({ userId, query, limit }: SearchTeamsOptions) {
	// the teams this user is on, which a pending request to join is not yet one of
	const memberTeamIds = userId
		? db
				.select({ teamId: teamMembers.teamId })
				.from(teamMembers)
				.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		: null

	// a visitor finds the public teams alone, and a member finds their own beside them
	const isFindable = memberTeamIds
		? or(eq(teams.isPublic, true), inArray(teams.id, memberTeamIds))
		: eq(teams.isPublic, true)

	// the name match on the findable teams, with the typed characters escaped, shorter names first
	return db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey })
		.from(teams)
		.where(and(isFindable, like(sql`lower(${teams.name})`, toContainsLikePattern(query))))
		.orderBy(sql`length(${teams.name})`, teams.id)
		.limit(limit)
}
