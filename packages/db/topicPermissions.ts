// the shared access checks for topics, and the topic view rules in SQL. a topic finding's checks are in
// findingPermissions.ts

import { and, eq, inArray, or, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { toTopicRoleFilter } from "./contentFilters"
import { type DbHandle, db, isPublicAndShown } from "./index"
import { loadUserAccess } from "./quotas"
import { memoizeInRequest } from "./requestMemo"
import { invites } from "./schema/invites"
import { teamMembers } from "./schema/teams"
import { teamTopics } from "./schema/teamTopics"
import { subscriptions, topics } from "./schema/topics"
import { users } from "./schema/users"

// a topic row, the shape every check in this file takes
type TopicRow = typeof topics.$inferSelect

// the topic columns that isAllowed reads
export const gatedTopicColumns = {
	id: topics.id,
	ownerId: topics.ownerId,
	visibility: topics.visibility,
	teamId: topics.teamId,
}

// those columns and the Topic's name, for a read that also shows the Topic
export const namedTopicColumns = { ...gatedTopicColumns, name: topics.name }
export type NamedTopic = Pick<TopicRow, keyof typeof namedTopicColumns>

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
	transaction: DbHandle = db,
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
	const memberships = await transaction
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
 * Checks edit authority for a sender column in a Topic-scoped database query.
 */
export function toEditableTopicFilter(userId: string | SQLWrapper): SQL {
	return sql`(exists (select 1 from ${users} where ${users.id} = ${userId} and ${users.role} = 'admin')
		or ${toOwningTeamEditFilter(userId)})`
}

// require active membership for both the sender and the owning Team's Topic owner
function toOwningTeamEditFilter(userId: string | SQLWrapper): SQL {
	return sql`(${topics.ownerId} = ${userId} or (
		exists (select 1 from ${teamMembers} where ${teamMembers.teamId} = ${topics.teamId}
			and ${teamMembers.userId} = ${userId} and ${teamMembers.isActive} = true)
		and exists (select 1 from ${teamMembers} where ${teamMembers.teamId} = ${topics.teamId}
			and ${teamMembers.userId} = ${topics.ownerId} and ${teamMembers.isActive} = true)
	))`
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
	// an empty selection needs no database query
	if (topicIds.length === 0) {
		return new Set()
	}

	// load active subscriptions within the selection
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
 * Returns the invite topic subscription start date that gates what this user reads, null if the user has no active
 * subscription, or undefined if no gate applies.
 */
export async function topicSubscriptionStartDate(
	topic: Pick<TopicRow, "id" | "ownerId" | "visibility" | "teamId">,
	userId: string | null,
	isAdmin: boolean,
): Promise<Date | null | undefined> {
	// only an invite topic gates what a user reads, never for an admin, and never for an effective role
	if (topic.visibility !== "invite" || isAdmin || (await toTopicRole(userId, topic)) !== null) {
		return undefined
	}
	// a signed-out user holds no subscription to activate
	return userId ? subscriptionActivatedAt(userId, topic.id) : null
}

/**
 * Returns whether a time passes the user's subscription activation gate. No gate passes every time, no active
 * subscription passes none, and an activation passes only a later time.
 */
export function isAfterSubscriberActivation(
	time: Date | null,
	subscriberActivatedAt: Date | null | undefined,
): boolean {
	if (subscriberActivatedAt === undefined) {
		return true
	}
	return subscriberActivatedAt !== null && time !== null && time > subscriberActivatedAt
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

/**
 * The topic ids among the given set the user reaches through team membership.
 * Two queries resolve every topic at once, the same shape as subscribedTopicIds.
 */
export async function memberTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
	// an empty id list matches nothing, so skip the query
	if (topicIds.length === 0) {
		return new Set()
	}

	// the topics held by a team the user belongs to: through topics.teamId or a teamTopics share
	const [memberRows, sharedRows] = await Promise.all([
		db
			.select({ topicId: topics.id })
			.from(topics)
			.innerJoin(teamMembers, and(eq(teamMembers.teamId, topics.teamId), eq(teamMembers.isActive, true)))
			.where(and(inArray(topics.id, topicIds), eq(teamMembers.userId, userId))),
		db
			.select({ topicId: teamTopics.topicId })
			.from(teamTopics)
			.innerJoin(teamMembers, and(eq(teamMembers.teamId, teamTopics.teamId), eq(teamMembers.isActive, true)))
			.where(and(inArray(teamTopics.topicId, topicIds), eq(teamMembers.userId, userId))),
	])
	return new Set([...memberRows, ...sharedRows].map((topicRow) => topicRow.topicId))
}

/**
 * Checks owner/admin Scan authority through the caller's database handle.
 */
export async function canRequestTopicScan(
	userId: string | null,
	topic?: Pick<TopicRow, "ownerId">,
	handle: DbHandle = db,
): Promise<boolean> {
	if (!userId) {
		return false
	}
	const access = await loadUserAccess(userId, handle)
	return access.isAdmin || topic?.ownerId === userId
}
