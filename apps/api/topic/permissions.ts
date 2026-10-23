// the shared access checks for topics, and the topic view rules in SQL. a topic finding's checks are in
// findingPermissions.ts

import { db, isPublicAndShown } from "@carlnotes/db"
import { memoizeInRequest } from "@carlnotes/db/requestMemo"
import { invites } from "@carlnotes/db/schema/invites"
import { teamMembers, teamTopics } from "@carlnotes/db/schema/teams"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { and, eq, inArray, or, type SQL, type SQLWrapper, sql } from "drizzle-orm"

// a topic row, the shape every check in this file takes
type TopicRow = typeof topics.$inferSelect

// the topic columns that isAllowed reads
export const gatedTopicColumns = {
	id: topics.id,
	ownerId: topics.ownerId,
	visibility: topics.visibility,
	teamId: topics.teamId,
}

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

	// the team role, read at most once per request for this user and topic
	return memoizeInRequest(`topic-role:${userId}:${topic.id}:${topic.teamId ?? ""}`, async () => {
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

		// leader sorts before member, so a user who leads any of those teams is a leader here
		return membership?.role ?? null
	})
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

/**
 * Returns a subquery of this user's email, empty until they verify it.
 */
export function verifiedEmailQuery(userId: string): SQLWrapper {
	return db
		.select({ email: users.email })
		.from(users)
		.where(and(eq(users.id, userId), eq(users.emailVerified, true)))
}

/**
 * Returns the topic view rules in SQL. A visitor sees a public topic with enough findings, and a user also sees the
 * topics toTopicAccessFilter allows.
 */
export function toTopicViewFilter(userId: string | null): SQL | undefined {
	return userId ? or(toTopicAccessFilter(userId), isPublicAndShown) : isPublicAndShown
}

/**
 * Returns the topics a user may open through their account in SQL: a topic they have a role on, and an invite topic
 * that names their verified email or that they subscribe to.
 */
export function toTopicAccessFilter(userId: string): SQL | undefined {
	// the invite topics that name one of the user's verified addresses
	const invitedTopicIds = db
		.select({ topicId: invites.topicId })
		.from(invites)
		.where(inArray(invites.email, verifiedEmailQuery(userId)))

	// the topics the user subscribes to
	const subscribedTopicIds = db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(and(eq(subscriptions.subscriberUserId, userId), eq(subscriptions.isActive, true)))

	// a topic the user has a role on, or an invite topic they are invited to or subscribe to
	return or(
		toTopicRoleFilter(userId),
		and(
			eq(topics.visibility, "invite"),
			or(inArray(topics.id, invitedTopicIds), inArray(topics.id, subscribedTopicIds)),
		),
	)
}

/**
 * Returns whether the user has a role on a topic in SQL: they own it, a team of theirs owns it, or a team of theirs
 * holds it through a share.
 */
export function toTopicRoleFilter(userId: string): SQL | undefined {
	// the user's active teams, and the topics shared with those teams
	const memberTeamIds = db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
	const sharedTopicIds = db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(inArray(teamTopics.teamId, memberTeamIds))

	// a topic the user owns, or one their teams own or hold
	return or(eq(topics.ownerId, userId), inArray(topics.teamId, memberTeamIds), inArray(topics.id, sharedTopicIds))
}

// whether an address the user has verified is on the topic's invite list
async function isInvited(userId: string, topicId: string): Promise<boolean> {
	// only a verified address matches, since anyone can sign up with an unproven one
	const [invite] = await db
		.select({ email: invites.email })
		.from(invites)
		.where(and(eq(invites.topicId, topicId), inArray(invites.email, verifiedEmailQuery(userId))))
		.limit(1)
	return invite !== undefined
}

/**
 * Returns the ids of the topics the user subscribes to among the given ones. The owner's own subscription exists from
 * creation.
 */
export async function loadSubscribedTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
	const subscriptionRows = await db
		.select({ topicId: subscriptions.topicId })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
				inArray(subscriptions.topicId, topicIds),
			),
		)
	return new Set(subscriptionRows.map((subscriptionRow) => subscriptionRow.topicId))
}

// an active subscription on the topic is the grant. deactivating one ends it without losing the row
export async function hasSubscription(userId: string, topicId: string): Promise<boolean> {
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
 * When the user's subscription to the topic became active, or null with no active subscription.
 */
export async function subscriptionActivatedAt(userId: string, topicId: string): Promise<Date | null> {
	const activatedAtByTopicId = await subscriptionActivatedAtByTopicId(userId, [topicId])
	return activatedAtByTopicId.get(topicId) ?? null
}

/**
 * When the user's subscription to each of the topics became active, by topic id. A topic with no active subscription
 * has no entry.
 */
export async function subscriptionActivatedAtByTopicId(userId: string, topicIds: string[]): Promise<Map<string, Date>> {
	// an empty id list matches nothing, so skip the query
	if (topicIds.length === 0) {
		return new Map()
	}

	// the earliest activation of each topic wins
	const activationRows = await db
		.select({
			topicId: subscriptions.topicId,
			activatedAt: sql<Date | string>`min(${subscriptions.createdAt})`,
		})
		.from(subscriptions)
		.where(
			and(
				inArray(subscriptions.topicId, topicIds),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
		.groupBy(subscriptions.topicId)
	return new Map(activationRows.map((activationRow) => [activationRow.topicId, new Date(activationRow.activatedAt)]))
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
 * Throws on a union case its caller's branches did not handle, so a new case breaks the build at every call site.
 */
export function assertNever(value: never): never {
	throw new Error(`unhandled case: ${value}`)
}
