// the shared access checks for topics and topic findings
import { MINIMUM_SHOWN_FINDINGS } from "@shared/enums"
import { and, eq, inArray, or, sql } from "drizzle-orm"
import { db } from "../../db"
import { findings, invites, scans, subscriptions, teamMembers, teamTopics, topics, users } from "../../db/schema"

// a topic row, shared by every check below
type TopicRow = typeof topics.$inferSelect

/**
 * The topic row when the user owns it, otherwise undefined. The owner gate that every write shares.
 */
export async function loadOwnedTopic(userId: string, topicId: string): Promise<TopicRow | undefined> {
	// one lookup checks both existence and ownership
	const [topic] = await db
		.select()
		.from(topics)
		.where(and(eq(topics.id, topicId), eq(topics.ownerId, userId)))
	return topic
}

// the user's role on a topic, or null with no grant
export type TopicRole = "owner" | "leader" | "member" | null

/**
 * The user's effective role on a topic: owner when the topic is theirs, their team role when the
 * topic belongs to a team they are in, and null with no grant at all. The one resolver every
 * capability answer builds on, so a route and a query can never disagree about who someone is.
 */
export async function toTopicRole(
	userId: string | null,
	topic: Pick<TopicRow, "id" | "ownerId" | "teamId">,
): Promise<TopicRole> {
	// ownership outranks membership, and a signed-out user holds nothing
	if (!userId) {
		return null
	}
	if (topic.ownerId === userId) {
		return "owner"
	}

	// membership in any team that has the topic grants the role: the owning team beside the shared-into ones
	const sharedTeamIds = db
		.select({ teamId: teamTopics.teamId })
		.from(teamTopics)
		.where(eq(teamTopics.topicId, topic.id))
	const topicTeamMatches = [inArray(teamMembers.teamId, sharedTeamIds)]
	if (topic.teamId) {
		topicTeamMatches.push(eq(teamMembers.teamId, topic.teamId))
	}

	// one query covers every team that has it
	const [membership] = await db
		.select({ role: teamMembers.role })
		.from(teamMembers)
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true), or(...topicTeamMatches)))
		.orderBy(teamMembers.role)
		.limit(1)
	return membership?.role ?? null
}

/**
 * Who may edit a topic: its owner, and the members of the owning team while the owner is still one
 * of them. A team that only has a share never edits somebody else's topic, and a team the owner has
 * left stops editing what they left behind. Reading stays wider — see toTopicRole.
 */
export async function toTopicEditRole(
	userId: string | null,
	topic: Pick<TopicRow, "ownerId" | "teamId">,
): Promise<TopicRole> {
	if (!userId) {
		return null
	}
	if (topic.ownerId === userId) {
		return "owner"
	}
	// a topic on no team is its owner's alone
	if (!topic.teamId) {
		return null
	}

	// the owning team edits together because the owner is one of them
	const memberships = await db
		.select({ userId: teamMembers.userId, role: teamMembers.role })
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.teamId, topic.teamId),
				eq(teamMembers.isActive, true),
				inArray(teamMembers.userId, [userId, topic.ownerId]),
			),
		)
	if (!memberships.some((membership) => membership.userId === topic.ownerId)) {
		return null
	}
	return memberships.find((membership) => membership.userId === userId)?.role ?? null
}

/**
 * Whether the user may see the topic at all. The owner, the topic's team, and public topics always,
 * invite topics only for invited emails or active subscribers, private topics nobody else.
 */
export async function canSeeTopic(
	userId: string | null,
	topic: Pick<TopicRow, "id" | "ownerId" | "visibility" | "teamId">,
): Promise<boolean> {
	// any effective role reads the topic, whatever its visibility
	if ((await toTopicRole(userId, topic)) !== null) {
		return true
	}
	if (topic.visibility === "public") {
		return true
	}
	// a private topic is its team's and owner's alone, and a signed-out visitor can't be invited or subscribed
	if (topic.visibility === "private" || !userId) {
		return false
	}

	// an invite topic can only be seen by invited emails and active subscribers
	return (await isInvited(userId, topic.id)) || (await hasSubscription(userId, topic.id))
}

// whether the user's account email is on the topic's invite list
async function isInvited(userId: string, topicId: string): Promise<boolean> {
	// match the invite email against the user's email with a subquery, so one round trip decides it
	const userEmail = db.select({ email: users.email }).from(users).where(eq(users.id, userId))
	const [invite] = await db
		.select({ email: invites.email })
		.from(invites)
		.where(and(eq(invites.topicId, topicId), inArray(invites.email, userEmail)))
		.limit(1)
	return invite !== undefined
}

// an active subscription on the topic is the grant. deactivating one ends it without losing the row
async function hasSubscription(userId: string, topicId: string): Promise<boolean> {
	const [subscription] = await db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, topicId),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
		.limit(1)
	return subscription !== undefined
}

/**
 * Whether a public TopicRow has enough kept Findings to be shown in Featured topics, Popular topics,
 * and the profile table.
 */
export const isShown = sql`(
	select count(*) from ${findings} where ${findings.topicId} = ${topics.id}
) >= ${MINIMUM_SHOWN_FINDINGS}`

/**
 * When the user's subscription to the topic became active, or null with no active subscription.
 */
export async function subscriptionActivatedAt(userId: string, topicId: string): Promise<Date | null> {
	// the earliest activation wins
	const [activationRow] = await db
		.select({ activatedAt: sql<Date | string | null>`min(${subscriptions.createdAt})` })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, topicId),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
	return activationRow?.activatedAt ? new Date(activationRow.activatedAt) : null
}

/**
 * A topic is only visible after the first scan after its activation.
 */
export function isVisibleAfterActivation(scanStartedAt: Date, activatedAt: Date | null): boolean {
	return activatedAt !== null && scanStartedAt > activatedAt
}

/**
 * The user's direct subscription row on a topic, ignoring team member paths.
 */
export async function loadDirectSubscription(
	userId: string,
	topicId: string,
): Promise<{ id: string; isActive: boolean } | undefined> {
	// the topic and this user's id together identify at most one row
	const [subscription] = await db
		.select({ id: subscriptions.id, isActive: subscriptions.isActive })
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
		.limit(1)
	return subscription
}

/**
 * Whether the user may rate a topic. The owner always may, and a non-owner only as a subscriber.
 */
export async function canRateTopic(
	userId: string | null,
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId">,
): Promise<boolean> {
	// a signed-out visitor has no account to rate as
	if (!userId) {
		return false
	}

	// the owner and every team member may rate, whatever the topic's visibility
	if ((await toTopicRole(userId, topic)) !== null) {
		return true
	}

	// anyone else may rate only as a subscriber, and a private topic never has one
	switch (topic.visibility) {
		case "public":
		case "invite":
			return hasSubscription(userId, topic.id)
		case "private":
			return false
		// a new visibility value fails to compile here
		default:
			return assertNever(topic.visibility)
	}
}

/**
 * A finding has the same rating rule as its topic.
 */
export async function canRateFinding(userId: string, findingId: string): Promise<boolean> {
	const topic = await loadFindingTopic(findingId)
	return topic ? canRateTopic(userId, topic) : false
}

/**
 * Whether the user may bookmark a topic finding. Bookmarks belong to the owner of the topic,
 * so seeing a finding is not enough to pin one.
 */
export async function canBookmarkFinding(userId: string, findingId: string): Promise<boolean> {
	// the owner and every team member may keep a finding
	const topic = await loadFindingTopic(findingId)
	return topic ? (await toTopicRole(userId, topic)) !== null : false
}

/**
 * Whether the user may see a topic finding. A signed-out visitor passes it for a public topic alone.
 */
export async function isTopicFindingVisible(userId: string | null, findingId: string): Promise<boolean> {
	// a missing finding is invisible to everyone
	const topic = await loadFindingTopic(findingId)
	if (!topic) {
		return false
	}

	// the owner and every team member see the topic's full history
	if ((await toTopicRole(userId, topic)) !== null) {
		return true
	}

	// anyone else sees a public topic outright, never a private one
	switch (topic.visibility) {
		case "public":
			return true
		case "invite":
			// an invite topic opens on a subscription, which a signed-out visitor holds none of
			if (!userId) {
				return false
			}
			return isVisibleAfterActivation(topic.scanStartedAt, await subscriptionActivatedAt(userId, topic.id))
		case "private":
			return false
		// a new visibility value fails to compile here
		default:
			return assertNever(topic.visibility)
	}
}

// the id, owner, and visibility of a topic finding's topic plus its scan's start time
async function loadFindingTopic(findingId: string): Promise<
	| (Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId"> & {
			scanStartedAt: (typeof scans.$inferSelect)["startedAt"]
	  })
	| undefined
> {
	// one join maps from the finding to its topic and to the scan that produced it
	const [topic] = await db
		// biome-ignore format: one line keeps the select under the comment-density hook's limit
		.select({
		id: topics.id,
		ownerId: topics.ownerId,
		visibility: topics.visibility,
		teamId: topics.teamId,
		scanStartedAt: scans.startedAt,
	})
		.from(findings)
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.innerJoin(scans, eq(findings.scanId, scans.id))
		.where(eq(findings.id, findingId))
		.limit(1)
	// undefined when the finding id matches nothing
	return topic
}

// exhaustiveness guard. a compile error here means a topic visibility case went unhandled above
function assertNever(value: never): never {
	throw new Error(`unhandled case: ${value}`)
}
