import { toUsernameWithDigits } from "@carlnotes/contracts/usernames"
import { type DbTransaction, db, isUniqueViolation } from "@carlnotes/db"
import { canCreateTeamToday, loadUserAccess } from "@carlnotes/db/quotas"
import { teamMembers, teams, teamTopics } from "@carlnotes/db/schema/teams"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import { deletePodcastFeedToken } from "../podcast/podcastFeedTokens"
import { clearVisitorTopicPages } from "../topic/feeds"
import { canSeeTopic } from "../topic/permissions"
import { updateTopicSubscriberCount } from "../topic/subscriberCounts"
import { saveTeamTopicSubscriptions, toTeamRole } from "./members"

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

	// drop the visitors' copies of each attached topic's page, which names its teams
	await clearVisitorTopicPages(...payload.topicIds)
	return { status: "created", teamId }
}

// the team every account gets, named after the person who holds it
export function toUserTeamName(username: string): string {
	return `Team ${username}`
}

/**
 * Create a default user team named after them, with them leading it. A user who already leads one keeps it.
 * Returns the team's id, or null if the name could not be settled.
 */
export async function saveDefaultUserTeam(userId: string, username: string): Promise<string | null> {
	const teamName = toUserTeamName(username)

	// the team this user already leads by that name
	const [existingTeam] = await db
		.select({ teamId: teams.id })
		.from(teams)
		.innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
		.where(
			and(
				sql`lower(${teams.name}) = lower(${teamName})`,
				eq(teamMembers.userId, userId),
				eq(teamMembers.role, "leader"),
			),
		)
	if (existingTeam) {
		return existingTeam.teamId
	}

	// the plain name first, then a digits variant for the rare case where someone else already holds it
	return (await insertUserTeam(userId, teamName)) ?? (await insertUserTeam(userId, toUsernameWithDigits(teamName)))
}

// one attempt to add a team and its leader row, returning null if the name is already taken
async function insertUserTeam(userId: string, teamName: string): Promise<string | null> {
	const teamId = crypto.randomUUID()
	try {
		await db.transaction(async (transaction) => {
			await transaction.insert(teams).values({ id: teamId, name: teamName })
			await transaction.insert(teamMembers).values({ teamId, userId, role: "leader" })
		})
	} catch (error) {
		// the case-insensitive unique index reports a name someone else already holds
		if (isUniqueViolation(error)) {
			return null
		}
		throw error
	}
	return teamId
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

	// attach, then drop the visitors' copies of the topic's page, which names its teams
	const addTopicResult = await db.transaction((transaction) =>
		addTopicInTransaction(transaction, userId, teamId, topicId),
	)
	if (addTopicResult === "added") {
		await clearVisitorTopicPages(topicId)
	}
	return addTopicResult
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

	// the delivery: every activated team member's subscription, with email off, written after the topic attached
	const teamMemberRows = await transaction
		.select({ userId: teamMembers.userId })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
	await saveTeamTopicSubscriptions(
		transaction,
		teamId,
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
	const deactivatedSubscriberUserIds = await db.transaction(async (transaction) => {
		// the team's active members, whose subscriptions the deactivation below is scoped to
		const teamMemberRows = await transaction
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

		// leave out the topic's owner, and stop if no other member is left
		const teamMemberIds = teamMemberRows
			.map((teamMemberRow) => teamMemberRow.userId)
			.filter((id) => id !== topic?.ownerId)
		if (teamMemberIds.length === 0) {
			return []
		}

		// everyone else loses the subscription it fanned out
		const deactivatedSubscriptionRows = await transaction
			.update(subscriptions)
			.set({ isActive: false, isEmailEnabled: false })
			.where(
				and(
					eq(subscriptions.topicId, topicId),
					inArray(subscriptions.subscriberUserId, teamMemberIds),
					notInArray(subscriptions.subscriberUserId, coveredMemberIds),
					notInArray(subscriptions.subscriberUserId, owningTeamMemberIds),
				),
			)
			.returning({ subscriberUserId: subscriptions.subscriberUserId })

		// update the stored count after the deactivations, and return the members who lost a subscription
		await updateTopicSubscriberCount(topicId, transaction)
		return deactivatedSubscriptionRows.map((deactivatedSubscriptionRow) => deactivatedSubscriptionRow.subscriberUserId)
	})

	// delete the podcast feed token of each member who lost the subscription, and drop the visitors' copies of the
	// topic's page, which names its teams
	await Promise.all([
		...deactivatedSubscriberUserIds.map((deactivatedSubscriberUserId) =>
			deletePodcastFeedToken({ topicId, userId: deactivatedSubscriberUserId }),
		),
		clearVisitorTopicPages(topicId),
	])
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
