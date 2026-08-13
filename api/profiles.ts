// the public profile: who a username belongs to, and the Topics they own.
// it only includes aggregate counts to protect user privacy
import {
	type ProfileResponse,
	type ProfileTopic,
	USER_SEARCH_LIMIT,
	USER_SEARCH_MIN_CHARS,
	type UserSearchResult,
} from "@shared/contracts"
import { toNormalizedUsername } from "@shared/usernames"
import { and, count, countDistinct, eq, inArray, isNotNull, like, ne, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { audienceMembers, findings, scans, subscriptions, topics, users } from "../db/schema"
import { isAllowed } from "./authorization"
import { type AppEnv, currentUser } from "./currentUser"
import { isShown } from "./topic/permissions"

// the transaction a caller is already inside, or the pool when there is none
type DbHandle = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Users whose username contains the search query. Matched on the normalized username and query.
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
	// normalized usernames are lowercase alphanumerics, so anything else in a query could only act as a LIKE wildcard
	const normalized = toNormalizedUsername(query).replaceAll(/[^a-z0-9]/g, "")
	// too short a query matches most of the table, so it is not worth a search
	if (normalized.length < USER_SEARCH_MIN_CHARS) {
		return []
	}

	// sort shorter names first, since an exact match is shorter than a name that contains it
	const rows = await db
		.select({ userId: users.id, username: users.username, avatarSource: users.avatarSource })
		.from(users)
		.where(like(users.usernameNormalized, `%${normalized}%`))
		.orderBy(sql`length(${users.usernameNormalized})`)
		.limit(USER_SEARCH_LIMIT)
	return rows.map((row) => ({ userId: row.userId, username: row.username, avatarSource: row.avatarSource }))
}

/**
 * A user's public profile by id, or null when there is no such user.
 * An owner viewing their own profile sees their private and invite topics, which are hidden for everyone else except an admin.
 */
export async function loadProfile(userId: string, viewerId: string | null): Promise<ProfileResponse | null> {
	const [user] = await db
		.select({ id: users.id, username: users.username, createdAt: users.createdAt, avatarSource: users.avatarSource })
		.from(users)
		.where(eq(users.id, userId))
	if (!user) {
		return null
	}

	// only an owner or an admin can see the non-public topics on the profile page
	const includesNonPublicTopics =
		viewerId === user.id || (viewerId !== null && (await isAllowed(viewerId, "admin:console")))
	return {
		userId: user.id,
		username: user.username,
		avatarSource: user.avatarSource,
		joinedAt: user.createdAt.toISOString(),
		subscriberCount: await countDistinctSubscribers(user.id),
		includesNonPublicTopics,
		topics: await loadProfileTopics(user.id, includesNonPublicTopics),
	}
}

/**
 * How many distinct people subscribe to this user's topics.
 */
export async function countDistinctSubscribers(userId: string, handle: DbHandle = db): Promise<number> {
	// every effective subscriber id across the owner's public topics, both paths unioned
	const subscriberIds = handle
		.select({
			subscriberId: sql<string>`coalesce(${subscriptions.subscriberUserId}, ${audienceMembers.userId})`.as(
				"subscriber_id",
			),
		})
		.from(subscriptions)
		.innerJoin(topics, eq(topics.id, subscriptions.topicId))
		.leftJoin(audienceMembers, eq(audienceMembers.audienceId, subscriptions.subscriberAudienceId))
		.where(and(eq(topics.ownerId, userId), eq(topics.visibility, "public"), eq(subscriptions.isActive, true)))
		.as("subscriber_ids")

	// count each person once, and never the owner following their own topic
	const [subscribers] = await handle
		.select({ subscriberCount: countDistinct(subscriberIds.subscriberId) })
		.from(subscriberIds)
		.where(and(isNotNull(subscriberIds.subscriberId), ne(subscriberIds.subscriberId, userId)))
	return subscribers?.subscriberCount ?? 0
}

// the topics the profile table shows. anyone sees the owner's public topics.
// only the owner or admin can see the non-public topics.
async function loadProfileTopics(userId: string, includesNonPublicTopics: boolean): Promise<ProfileTopic[]> {
	const visibleTopics = includesNonPublicTopics
		? eq(topics.ownerId, userId)
		: and(eq(topics.ownerId, userId), eq(topics.visibility, "public"), isShown)
	const rows = await db
		.select({
			id: topics.id,
			name: topics.name,
			visibility: topics.visibility,
			createdAt: topics.createdAt,
			updatedAt: topics.updatedAt,
			subscriberCount: topics.subscriberCount,
		})
		.from(topics)
		.where(visibleTopics)
		.orderBy(topics.createdAt)

	// the kept-over-seen figures come from the topic's past scans, aggregated across every scan it has run
	const keptAndSeen = await loadKeptAndSeen(rows.map((row) => row.id))
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		visibility: row.visibility,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		subscriberCount: row.subscriberCount,
		keptCount: keptAndSeen.get(row.id)?.kept ?? 0,
		seenCount: keptAndSeen.get(row.id)?.seen ?? 0,
	}))
}

// findings kept over resources seen, per topic, each figure aggregated on its own.
// one query joining findings and scans onto a topic would multiply every scan row by every finding row
async function loadKeptAndSeen(topicIds: string[]): Promise<Map<string, { kept: number; seen: number }>> {
	if (topicIds.length === 0) {
		return new Map()
	}
	// kept is the findings the topic holds. seen is what its scans reviewed, kept and filtered together
	const [keptRows, seenRows] = await Promise.all([
		db
			.select({ topicId: findings.topicId, kept: count() })
			.from(findings)
			.where(inArray(findings.topicId, topicIds))
			.groupBy(findings.topicId),
		db
			.select({
				topicId: scans.topicId,
				seen: sql<number>`coalesce(sum(${scans.keptCount} + ${scans.filteredCount}), 0)`,
			})
			.from(scans)
			.where(and(inArray(scans.topicId, topicIds), eq(scans.status, "succeeded")))
			.groupBy(scans.topicId),
	])

	// merge the two aggregates, with zero standing in for a topic absent from either
	const keptByTopic = new Map(keptRows.map((row) => [row.topicId, row.kept]))
	const seenByTopic = new Map(seenRows.map((row) => [row.topicId, Number(row.seen)]))
	return new Map(
		topicIds.map((topicId) => [topicId, { kept: keptByTopic.get(topicId) ?? 0, seen: seenByTopic.get(topicId) ?? 0 }]),
	)
}

// the public profile routes: the search bar's user suggestions and the profile page
export const profilesRoute = new Hono<AppEnv>()
	// public: who a user can find by name, for the search bar's user suggestions
	.get("/users", async (context) => {
		return context.json({ users: await searchUsers(context.req.query("q") ?? "") })
	})
	// a profile does not require a session. but a session is required to show non-public topics to the owner or an admin.
	.get("/profiles/:userId", async (context) => {
		const profile = await loadProfile(context.req.param("userId"), currentUser(context))
		return profile ? context.json(profile) : context.json({ error: "not found" }, 404)
	})
