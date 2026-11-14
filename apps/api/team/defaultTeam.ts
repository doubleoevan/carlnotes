// a user's default team: the team of their oldest leader membership, which a public or invite topic goes on unless
// another team is chosen or a team already holds it
import type { Visibility } from "@carlnotes/contracts/enums"
import type { TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topics } from "@carlnotes/db/schema/topics"
import { and, asc, eq } from "drizzle-orm"
import { addTopicToTeam } from "./teams"

/**
 * Loads the team of the user's oldest active leader membership, or null for a user who leads no team. Two
 * memberships that start at the same time go to the older team.
 */
export async function loadDefaultTeam(userId: string): Promise<TopicDraftTeam | null> {
	// the user's active leader memberships, oldest first
	const [defaultTeam] = await db
		.select({ teamId: teams.id, name: teams.name })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true), eq(teamMembers.role, "leader")))
		.orderBy(asc(teamMembers.createdAt), asc(teams.createdAt))
		.limit(1)

	// none for a user who leads no team
	return defaultTeam ?? null
}

/**
 * Returns the team a draft goes on: none for a private draft, else the team it names, which may be no team, or the
 * default team if it names none.
 */
export function toDraftTeamWithDefault({
	visibility,
	team,
	defaultTeam,
}: {
	// the draft's visibility and the team it names, null for no team and undefined if it names none
	visibility: Visibility
	team: TopicDraftTeam | null | undefined
	defaultTeam: TopicDraftTeam | null
}): TopicDraftTeam | null {
	// a private draft goes on no team, and any other on the team it names, or on the default one if it names none
	if (visibility === "private") {
		return null
	}
	return team === undefined ? defaultTeam : team
}

/**
 * Puts a private topic made public or invite on its owner's default team, unless the edit names its own team or a
 * team already holds the topic, and returns that team's name if it was added.
 */
export async function addTopicToDefaultTeamOnVisibilityChange({
	ownerId,
	topicId,
	previousVisibility,
	visibility,
	isDefaultTeamApplied,
}: {
	// the topic, its visibility before and after the edit, and whether the edit leaves the team to the default
	ownerId: string
	topicId: string
	previousVisibility: Visibility
	visibility: Visibility | undefined
	isDefaultTeamApplied: boolean
}): Promise<string | null> {
	// only a topic leaving private, in an edit that names no team change
	const isLeavingPrivate = previousVisibility === "private" && visibility !== undefined && visibility !== "private"
	return isLeavingPrivate && isDefaultTeamApplied ? await addTopicToDefaultTeam(ownerId, topicId) : null
}

// put a topic that a team does not hold on its owner's default team, and return that team's name if it was added
async function addTopicToDefaultTeam(ownerId: string, topicId: string): Promise<string | null> {
	// the topic's owning team and one team it is shared into, if any
	const [topicTeamIds] = await db
		.select({ owningTeamId: topics.teamId, sharedTeamId: teamTopics.teamId })
		.from(topics)
		.leftJoin(teamTopics, eq(teamTopics.topicId, topics.id))
		.where(eq(topics.id, topicId))
		.limit(1)

	// a topic that a team already holds keeps it
	if (!topicTeamIds || topicTeamIds.owningTeamId || topicTeamIds.sharedTeamId) {
		return null
	}

	// the owner's default team, if they lead one
	const defaultTeam = await loadDefaultTeam(ownerId)
	if (!defaultTeam) {
		return null
	}
	return (await addTopicToTeam(ownerId, defaultTeam.teamId, topicId)) === "added" ? defaultTeam.name : null
}
