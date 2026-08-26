// whether two users have interacted, derived at invite creation
import { and, eq, gt, inArray, isNotNull, or } from "drizzle-orm"
import { db } from "../db"
import { invites, subscriptions, teamMembers, topics, users } from "../db/schema"

/**
 * Whether the sender counts as connected to the recipient. Any one of the three checks is enough.
 */
export async function isConnected(senderUserId: string, recipientUserId: string): Promise<boolean> {
	// a shared team: some team holds membership rows for both users
	const senderTeams = db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(and(eq(teamMembers.userId, senderUserId), eq(teamMembers.isActive, true)))
	// one recipient membership inside the sender's teams is enough
	const [sharedTeam] = await db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.userId, recipientUserId),
				eq(teamMembers.isActive, true),
				inArray(teamMembers.teamId, senderTeams),
			),
		)
		.limit(1)
	if (sharedTeam) {
		return true
	}

	// an active subscription that the recipient holds on one of the sender's topics
	const [subscribed] = await db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.innerJoin(topics, eq(topics.id, subscriptions.topicId))
		.where(
			// the recipient's own active row on a topic the sender owns
			and(
				eq(subscriptions.subscriberUserId, recipientUserId),
				eq(subscriptions.isActive, true),
				eq(topics.ownerId, senderUserId),
			),
		)
		.limit(1)
	if (subscribed) {
		return true
	}

	// an invitation from the sender that the recipient accepted before
	const [recipient] = await db.select({ email: users.email }).from(users).where(eq(users.id, recipientUserId))
	const [accepted] = await db
		.select({ id: invites.id })
		.from(invites)
		.where(
			// the sender's rows with a spent use, reaching the recipient by account or by email address
			and(
				eq(invites.invitedByUserId, senderUserId),
				gt(invites.usedCount, 0),
				or(
					eq(invites.invitedUserId, recipientUserId),
					recipient ? and(isNotNull(invites.email), eq(invites.email, recipient.email)) : undefined,
				),
			),
		)
		.limit(1)
	return accepted !== undefined
}
