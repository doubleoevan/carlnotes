// the subscription start dates that gate an invite topic's findings for a user
import type { topics } from "@carlnotes/db/schema/topics"
import { loadUserAccess, memberTopicIds } from "../authorization"
import { subscriptionActivatedAt, subscriptionActivatedAtByTopicId, toTopicRole } from "./permissions"

// the invite-topic findings subscription start date for this user
export async function topicSubscriptionStartDate(
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId">,
	userId: string | null,
	isAdmin: boolean,
): Promise<Date | null | undefined> {
	// only an invite topic gates findings, never for an admin, and never for an effective role
	if (topic.visibility !== "invite" || isAdmin || (await toTopicRole(userId, topic)) !== null) {
		return undefined
	}
	// a signed-out user holds no subscription to activate
	return userId ? subscriptionActivatedAt(userId, topic.id) : null
}

/**
 * Returns topicSubscriptionStartDate for many topics in a fixed number of queries, by topic id.
 * A topic that gates nothing for the user has no entry.
 */
export async function topicSubscriptionStartDates(
	topicRows: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">[],
	userId: string | null,
): Promise<Map<string, Date | null>> {
	// only an invite topic gates findings, and a signed-out user holds no subscription to activate
	const inviteTopicRows = topicRows.filter((topicRow) => topicRow.visibility === "invite")
	if (inviteTopicRows.length === 0 || !userId) {
		return new Map(inviteTopicRows.map((topicRow) => [topicRow.id, null]))
	}

	// whether the user is an admin, the topics a team of the user holds, and when each subscription activated
	const inviteTopicIds = inviteTopicRows.map((topicRow) => topicRow.id)
	const [{ isAdmin }, memberTopicIdSet, activatedAtByTopicId] = await Promise.all([
		loadUserAccess(userId),
		memberTopicIds(userId, inviteTopicIds),
		subscriptionActivatedAtByTopicId(userId, inviteTopicIds),
	])

	// an admin and an effective role are never gated. the owner and a holding team's member each have an effective role
	const gatedTopicRows = isAdmin
		? []
		: inviteTopicRows.filter((topicRow) => topicRow.ownerId !== userId && !memberTopicIdSet.has(topicRow.id))
	return new Map(gatedTopicRows.map((topicRow) => [topicRow.id, activatedAtByTopicId.get(topicRow.id) ?? null]))
}
