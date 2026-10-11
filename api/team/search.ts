// the team name search behind the search bar, and the like-pattern escape the topic search shares
import { toAvatarKeyVersion } from "@shared/avatars"
import type { TeamSearchResult } from "@shared/contracts"
import { SEARCH_MIN_CHARS, USER_SEARCH_LIMIT } from "@shared/contracts"
import { toNormalizedUsername } from "@shared/usernames"
import { and, eq, inArray, like, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { teamMembers, teams } from "../../db/schema/teams"

/**
 * Teams whose name contains the query, for the search bar's team suggestions. A public team is found
 * by anyone, and a signed-in user also finds the teams they belong to at any visibility.
 */
export async function searchTeams(query: string, userId: string | null): Promise<TeamSearchResult[]> {
	// the query must meet the same minimum length a username search has
	const username = toNormalizedUsername(query).replaceAll(/[^a-z0-9]/g, "")
	if (username.length < SEARCH_MIN_CHARS) {
		return []
	}

	// read the matching teams and add their avatar versions
	const teamRows = await toTeamSearchQuery(query, userId)
	return teamRows.map((teamRow) => ({
		teamId: teamRow.teamId,
		name: teamRow.name,
		avatarVersion: toAvatarKeyVersion(teamRow.avatarKey),
	}))
}

/**
 * Returns the team search's query, shorter names first.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
export function toTeamSearchQuery(query: string, userId: string | null) {
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

	// the name match on the findable teams, shorter names first
	return db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey })
		.from(teams)
		.where(and(isFindable, like(sql`lower(${teams.name})`, `%${escapeLikePattern(query.toLowerCase())}%`)))
		.orderBy(sql`length(${teams.name})`)
		.limit(USER_SEARCH_LIMIT)
}

/**
 * Returns a like pattern that matches the typed characters literally, never as wildcards.
 */
export function escapeLikePattern(query: string): string {
	return query.replaceAll(/[\\%_]/g, (wildcard) => `\\${wildcard}`)
}
