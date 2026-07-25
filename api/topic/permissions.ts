// the shared access checks for topics and topic findings. one place answers who may see, subscribe, and rate
import { and, eq, inArray, or } from "drizzle-orm"
import { db } from "../../db"
import { audienceMembers, findings, subscriptions, topicInvites, topics, users } from "../../db/schema"

// a topic row, shared by every check below
type Topic = typeof topics.$inferSelect

/**
 * The topic row when the user owns it, else undefined. The owner gate that every write shares.
 */
export async function loadOwnedTopic(userId: string, topicId: string): Promise<Topic | undefined> {
	// one lookup answers both existence and ownership
	const [topic] = await db
		.select()
		.from(topics)
		.where(and(eq(topics.id, topicId), eq(topics.ownerId, userId)))
	return topic
}

/**
 * Whether the user may see the topic at all. The owner and public topics always can see,
 * invite topics only for invited emails or existing subscribers, private topics never.
 */
export async function canSeeTopic(userId: string | null, topic: Topic): Promise<boolean> {
	// the owner and any public topic are visible outright
	if (topic.ownerId === userId || topic.visibility === "public") {
		return true
	}
	// a private topic is owner-only, and a signed-out visitor can't be invited or subscribed
	if (topic.visibility === "private" || !userId) {
		return false
	}

	// an invite topic opens to invited emails and existing subscribers
	return (await isInvited(userId, topic.id)) || (await hasSubscription(userId, topic.id))
}

// whether the user's account email is on the topic's invite list
async function isInvited(userId: string, topicId: string): Promise<boolean> {
	// match the invite email against the user's email with a subquery, so one round trip decides it
	const userEmail = db.select({ email: users.email }).from(users).where(eq(users.id, userId))
	const [invite] = await db
		.select({ email: topicInvites.email })
		.from(topicInvites)
		.where(and(eq(topicInvites.topicId, topicId), inArray(topicInvites.email, userEmail)))
		.limit(1)
	return invite !== undefined
}

// a subscription reaches a topic through the user directly or through an audience they belong to
async function hasSubscription(userId: string, topicId: string): Promise<boolean> {
	// collect the audiences the user belongs to for the audience path
	const memberAudiences = db
		.select({ audienceId: audienceMembers.audienceId })
		.from(audienceMembers)
		.where(eq(audienceMembers.userId, userId))

	// the subscriber is either the user directly or one of those audiences
	const subscriberMatches = or(
		eq(subscriptions.subscriberUserId, userId),
		inArray(subscriptions.subscriberAudienceId, memberAudiences),
	)

	// a matching subscription row on this topic is the grant
	const [subscription] = await db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), subscriberMatches))
		.limit(1)
	return subscription !== undefined
}

/**
 * The user's own direct subscription row on the topic, ignoring audience paths, or undefined.
 */
export async function loadDirectSubscription(userId: string, topicId: string): Promise<{ id: string } | undefined> {
	// the topic and this user's id together identify at most one row
	const [subscription] = await db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
		.limit(1)
	return subscription
}

/**
 * Whether the user may rate on the topic. The owner always may, and a non-owner only as a subscriber.
 */
export async function canRateTopic(
	userId: string | null,
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">,
): Promise<boolean> {
	// a signed-out visitor has no account to rate as
	if (!userId) {
		return false
	}

	// the owner may always rate
	if (topic.ownerId === userId) {
		return true
	}

	// a non-owner may rate only as a subscriber, and a private topic never has one
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
 * Whether the user may see a topic finding.
 */
export async function isTopicFindingVisible(userId: string, findingId: string): Promise<boolean> {
	// a missing finding is invisible to everyone
	const topic = await loadFindingTopic(findingId)
	if (!topic) {
		return false
	}

	// the owner always sees their own topic
	if (topic.ownerId === userId) {
		return true
	}

	// a non-owner sees a public topic outright and an invite topic as an invited email or subscriber, never a private one
	switch (topic.visibility) {
		case "public":
			return true
		case "invite":
			return (await isInvited(userId, topic.id)) || (await hasSubscription(userId, topic.id))
		case "private":
			return false
		// a new visibility value fails to compile here
		default:
			return assertNever(topic.visibility)
	}
}

// the id, owner, and visibility of a topic finding's topic, or undefined when the finding does not exist
async function loadFindingTopic(findingId: string) {
	const [topic] = await db
		.select({ id: topics.id, ownerId: topics.ownerId, visibility: topics.visibility })
		.from(findings)
		.innerJoin(topics, eq(findings.topicId, topics.id))
		.where(eq(findings.id, findingId))
		.limit(1)
	// undefined when the finding id matches nothing
	return topic
}

// exhaustiveness guard. a compile error here means a topic visibility case went unhandled above
function assertNever(value: never): never {
	throw new Error(`unhandled case: ${value}`)
}
