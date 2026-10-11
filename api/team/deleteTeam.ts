// deleting a team: the delete if nobody else is on it, the handover to a new leader if someone is, and the one
// team row delete behind both and an account close
import { and, eq } from "drizzle-orm"
import { type DbTransaction, db } from "../../db"
import { chatRoomAttachments } from "../../db/schema/chat"
import { teamMembers, teams } from "../../db/schema/teams"
import { users } from "../../db/schema/users"
import { deleteStoredObjects, recordPendingObjectDeletions } from "../../worker"
import { isLeaderRole } from "../authorization"
import { deleteChatRoomAttachmentRows } from "../chat/roomAttachments"
import { purgeEdgeCacheTagAfterDeletion, toTeamAvatarCacheTag } from "../edgeCache"
import { deactivateTeamTopicSubscriptions, removeTeamMemberInTransaction, toTeamRole } from "./members"

// the result of deleting a team with one leader: gone, or surviving under whoever leads it now
export type DeleteTeamResult =
	| { status: "deleted" }
	| { status: "handedOver"; newLeaderUsername: string }
	| { status: "forbidden" }

/**
 * Deletes a team with no leader outright, and hands a populated one to a new leader while the caller leaves.
 */
export async function deleteTeam(userId: string, teamId: string): Promise<DeleteTeamResult> {
	if ((await toTeamRole(userId, teamId)) !== "leader") {
		return { status: "forbidden" }
	}

	// the count and the delete share one transaction over the locked team row, since a team member joining
	// concurrently would otherwise keep active subscriptions to topics that the team deletion gives back to their owner
	const deletedTeamObjectKeys = await db.transaction(async (transaction) => {
		const [teamRow] = await transaction.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update")
		if (!teamRow) {
			return null
		}

		// any other active team members mean the team is not deleted
		const teamMemberRows = await transaction
			.select({ userId: teamMembers.userId })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
		if (teamMemberRows.some((memberRow) => memberRow.userId !== userId)) {
			return null
		}

		// delivery ends before the row is deleted, while the team membership list still shows who to deactivate
		await deactivateTeamTopicSubscriptions(
			transaction,
			teamId,
			teamMemberRows.map((memberRow) => memberRow.userId),
		)
		return deleteTeamRow(transaction, teamId)
	})

	// the team outlived the delete because someone else is on it, so the caller assigns it to a new team leader
	if (!deletedTeamObjectKeys) {
		return updateTeamLeader(userId, teamId)
	}

	// delete the team's avatar image and chat room attachments once the row is gone, and purge the avatar from the edge
	await deleteStoredObjects(deletedTeamObjectKeys)
	await purgeEdgeCacheTagAfterDeletion(toTeamAvatarCacheTag(teamId))
	return { status: "deleted" }
}

// pass leadership to the oldest active member when no other leader remains, then the caller leaves
async function updateTeamLeader(userId: string, teamId: string): Promise<DeleteTeamResult> {
	// one transaction over locked member rows, so a concurrent change to those rows lands before the
	// handover or after it, never inside it
	const newLeaderId = await db.transaction(async (transaction) => {
		const memberRows = await transaction
			.select({ userId: teamMembers.userId, role: teamMembers.role, createdAt: teamMembers.createdAt })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
			.for("update")
		// the team members who stay. a team with no other member has no one to pass the leader role to
		const otherMembers = memberRows.filter((memberRow) => memberRow.userId !== userId)
		if (otherMembers.length === 0) {
			return null
		}

		// an existing co-leader already holds the team. otherwise the longest-standing member takes it
		let newLeaderId = otherMembers.find((memberRow) => isLeaderRole(memberRow.role))?.userId
		if (!newLeaderId) {
			const [oldestMember] = [...otherMembers].sort(
				(a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.userId.localeCompare(b.userId),
			)
			newLeaderId = oldestMember?.userId ?? ""
			await transaction
				.update(teamMembers)
				.set({ role: "leader" })
				.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, newLeaderId)))
		}

		// the caller leaves through the same cleanup a removed member gets, mentions and subscriptions included
		await removeTeamMemberInTransaction(transaction, teamId, userId)
		return newLeaderId
	})

	// the members left concurrently, and then there was nobody to hand the team to
	if (!newLeaderId) {
		return { status: "forbidden" }
	}
	const [newLeader] = await db.select({ username: users.username }).from(users).where(eq(users.id, newLeaderId))
	return { status: "handedOver", newLeaderUsername: newLeader?.username ?? "" }
}

/**
 * Deletes a team row with its chat room attachment rows, records their object keys as pending on the transaction,
 * and returns the keys.
 */
export async function deleteTeamRow(transaction: DbTransaction, teamId: string): Promise<string[]> {
	// delete the chat room attachment rows, then the team row
	const chatRoomAttachmentKeys = await deleteChatRoomAttachmentRows(transaction, eq(chatRoomAttachments.teamId, teamId))
	const [deletedTeamRow] = await transaction
		.delete(teams)
		.where(eq(teams.id, teamId))
		.returning({ avatarKey: teams.avatarKey })

	// record the avatar key, if the team had one
	if (!deletedTeamRow?.avatarKey) {
		return chatRoomAttachmentKeys
	}
	await recordPendingObjectDeletions({ handle: transaction, objectKeys: [deletedTeamRow.avatarKey] })
	return [...chatRoomAttachmentKeys, deletedTeamRow.avatarKey]
}
